// Imported first by the payment specs: prices and a (faked) QPay merchant, set before `env()` is first read.
process.env.PLAN_PRICE_PROVIDER_MNT = '49900';
process.env.FEATURED_PRICE_PER_DAY_MNT = '5000';
process.env.QPAY_USERNAME = 'TEST_MERCHANT';
process.env.QPAY_PASSWORD = 'test';
process.env.QPAY_INVOICE_CODE = 'TEST_INVOICE';
