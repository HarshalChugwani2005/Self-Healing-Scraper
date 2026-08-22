// ============================================================================
// validator.test.js — Unit tests for Zod schema validation & prompt generator
// ============================================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateScrapedData, JobNotificationSchema, MIN_ROW_COUNT } = require('../src/validator');

describe('JobNotificationSchema', () => {
    it('should validate a valid job notification record', () => {
        const validRow = {
            post_date: '18/08/2026',
            recruitment_board: 'Bank of Baroda',
            post_name: '2482 Local Bank Officer (LBO)',
            qualification: 'Any Graduate',
            advt_no: 'Advt. No. 01/2026',
            last_date: '31/08/2026',
            detail_url: 'https://www.freejobalert.com/articles/bob-2026'
        };

        const result = JobNotificationSchema.safeParse(validRow);
        assert.equal(result.success, true);
    });

    it('should allow optional advt_no to be omitted or empty', () => {
        const rowWithoutAdvt = {
            post_date: '18/08/2026',
            recruitment_board: 'State Bank of India',
            post_name: 'Junior Associate',
            qualification: 'Degree',
            last_date: '30/08/2026',
            detail_url: 'https://www.freejobalert.com/articles/sbi-2026'
        };

        const result = JobNotificationSchema.safeParse(rowWithoutAdvt);
        assert.equal(result.success, true);
    });

    it('should fail when required fields are null or empty', () => {
        const invalidRow = {
            post_date: '18/08/2026',
            recruitment_board: '',
            post_name: null,
            qualification: 'Any Graduate',
            last_date: '31/08/2026',
            detail_url: ''
        };

        const result = JobNotificationSchema.safeParse(invalidRow);
        assert.equal(result.success, false);
        const paths = result.error.issues.map(i => i.path.join('.'));
        assert.ok(paths.includes('recruitment_board'));
        assert.ok(paths.includes('post_name'));
        assert.ok(paths.includes('detail_url'));
    });
});

describe('validateScrapedData', () => {
    function generateValidRows(count = 6) {
        return Array.from({ length: count }, (_, i) => ({
            post_date: `18/08/202${i}`,
            recruitment_board: `Board ${i}`,
            post_name: `Officer Post ${i}`,
            qualification: 'Any Graduate',
            advt_no: `0${i}/2026`,
            last_date: `31/08/202${i}`,
            detail_url: `https://www.freejobalert.com/articles/job-${i}`
        }));
    }

    it('should return valid=true for a healthy dataset of >= MIN_ROW_COUNT', () => {
        const rows = generateValidRows(10);
        const result = validateScrapedData(rows);

        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
        assert.equal(result.failureDescription, null);
        assert.equal(result.stats.totalRows, 10);
        assert.equal(result.stats.validRows, 10);
        assert.equal(result.stats.invalidRows, 0);
    });

    it('should fail when row count is below MIN_ROW_COUNT', () => {
        const rows = generateValidRows(3);
        const result = validateScrapedData(rows);

        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Row count too low')));
        assert.ok(result.failureDescription.includes('Only 3 rows were extracted'));
    });

    it('should fail and generate accurate failure description on broken selectors', () => {
        const brokenRows = [
            {
                post_date: '18/08/2026',
                recruitment_board: '18/08/2026', // column shifted
                post_name: null,                 // missing
                qualification: 'Any Graduate',
                advt_no: '01/2026',
                last_date: '31/08/2026',
                detail_url: ''                   // empty
            },
            {
                post_date: '17/08/2026',
                recruitment_board: '17/08/2026',
                post_name: null,
                qualification: 'B.E/B.Tech',
                advt_no: '',
                last_date: '30/08/2026',
                detail_url: ''
            },
            {
                post_date: '16/08/2026',
                recruitment_board: '16/08/2026',
                post_name: null,
                qualification: '10th Pass',
                advt_no: 'CR-01/2026',
                last_date: '29/08/2026',
                detail_url: ''
            },
            {
                post_date: '15/08/2026',
                recruitment_board: '15/08/2026',
                post_name: null,
                qualification: 'Diploma',
                advt_no: '',
                last_date: '28/08/2026',
                detail_url: ''
            },
            {
                post_date: '14/08/2026',
                recruitment_board: '14/08/2026',
                post_name: null,
                qualification: 'Degree',
                advt_no: '',
                last_date: '27/08/2026',
                detail_url: ''
            }
        ];

        const result = validateScrapedData(brokenRows);
        assert.equal(result.valid, false);
        assert.equal(result.stats.invalidRows, 5);
        assert.ok(result.failureDescription.includes('post_name'));
        assert.ok(result.failureDescription.includes('detail_url'));
        assert.ok(result.failureDescription.includes('Please fix the extraction selectors'));
    });

    it('should handle non-array or null input gracefully', () => {
        const nullResult = validateScrapedData(null);
        assert.equal(nullResult.valid, false);
        assert.equal(nullResult.stats.totalRows, 0);

        const objResult = validateScrapedData({ error: 'Failed' });
        assert.equal(objResult.valid, false);
    });
});
