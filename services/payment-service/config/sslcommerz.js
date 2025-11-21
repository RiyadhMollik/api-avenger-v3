module.exports = {
  store_id: process.env.SSLCOMMERZ_STORE_ID || 'dfdaf69200cb5ca39d',
  store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD || 'dfdaf69200cb5ca39d@ssl',
  is_live: false, // Use sandbox
  
  // API URLs
  sessionUrl: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
  validationUrl: 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
  
  // Callback URLs - these will be set dynamically with the actual server URL
  success_url: process.env.PAYMENT_SUCCESS_URL || 'http://localhost:4004/api/payments/sslcommerz/success',
  fail_url: process.env.PAYMENT_FAIL_URL || 'http://localhost:4004/api/payments/sslcommerz/fail',
  cancel_url: process.env.PAYMENT_CANCEL_URL || 'http://localhost:4004/api/payments/sslcommerz/cancel',
  ipn_url: process.env.PAYMENT_IPN_URL || 'http://localhost:4004/api/payments/sslcommerz/ipn',
};
