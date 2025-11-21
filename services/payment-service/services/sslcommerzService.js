const SSLCommerzPayment = require('sslcommerz-lts');
const axios = require('axios');
const sslConfig = require('../config/sslcommerz');

class SSLCommerzService {
  constructor(logger) {
    this.logger = logger;
    this.sslcz = new SSLCommerzPayment(sslConfig.store_id, sslConfig.store_passwd, sslConfig.is_live);
  }

  /**
   * Initiate SSLCommerz payment session
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} - Gateway URL and session info
   */
  async initiatePayment(paymentData) {
    const {
      transactionId,
      amount,
      pledgeId,
      campaignId,
      customerName,
      customerEmail,
      customerPhone,
    } = paymentData;

    const data = {
      total_amount: parseFloat(amount),
      currency: 'BDT',
      tran_id: transactionId, // Unique transaction ID
      success_url: sslConfig.success_url,
      fail_url: sslConfig.fail_url,
      cancel_url: sslConfig.cancel_url,
      ipn_url: sslConfig.ipn_url,
      
      // Product information
      product_name: `Donation to Campaign ${campaignId}`,
      product_category: 'Donation',
      product_profile: 'non-physical-goods',
      
      // Customer information
      cus_name: customerName || 'Guest Donor',
      cus_email: customerEmail || 'guest@careforall.com',
      cus_add1: 'Dhaka',
      cus_add2: 'Bangladesh',
      cus_city: 'Dhaka',
      cus_state: 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: customerPhone || '01711000000',
      cus_fax: '01711000000',
      
      // Shipping information (required even for donations)
      shipping_method: 'NO',
      num_of_item: 1,
      
      // Additional fields for tracking
      value_a: pledgeId, // Store pledgeId
      value_b: campaignId, // Store campaignId
      value_c: '', // Reserved for future use
      value_d: '', // Reserved for future use
    };

    try {
      this.logger.info('Initiating SSLCommerz payment', { transactionId, amount, pledgeId });
      
      const apiResponse = await this.sslcz.init(data);
      
      if (apiResponse.status === 'SUCCESS') {
        this.logger.info('SSLCommerz session created', { 
          transactionId, 
          sessionKey: apiResponse.sessionkey,
          gatewayUrl: apiResponse.GatewayPageURL 
        });
        
        return {
          success: true,
          gatewayUrl: apiResponse.GatewayPageURL,
          sessionKey: apiResponse.sessionkey,
          transactionId: apiResponse.tran_id,
        };
      } else {
        this.logger.error('SSLCommerz session failed', { 
          transactionId, 
          status: apiResponse.status,
          failedReason: apiResponse.failedreason 
        });
        
        return {
          success: false,
          message: apiResponse.failedreason || 'Payment initiation failed',
        };
      }
    } catch (error) {
      this.logger.error('SSLCommerz initiation error', { transactionId, error: error.message });
      throw error;
    }
  }

  /**
   * Validate payment with SSLCommerz
   * @param {string} valId - Validation ID from SSLCommerz
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Validation result
   */
  async validatePayment(valId, transactionId) {
    try {
      this.logger.info('Validating payment with SSLCommerz', { valId, transactionId });
      
      const validation = await this.sslcz.validate({ val_id: valId });
      
      if (validation.status === 'VALID' || validation.status === 'VALIDATED') {
        this.logger.info('Payment validated successfully', { 
          transactionId, 
          valId,
          amount: validation.amount,
          cardType: validation.card_type 
        });
        
        return {
          isValid: true,
          data: validation,
        };
      } else {
        this.logger.warn('Payment validation failed', { 
          transactionId, 
          valId,
          status: validation.status 
        });
        
        return {
          isValid: false,
          data: validation,
        };
      }
    } catch (error) {
      this.logger.error('Payment validation error', { transactionId, valId, error: error.message });
      throw error;
    }
  }

  /**
   * Process SSLCommerz IPN (Instant Payment Notification)
   * @param {Object} ipnData - IPN data from SSLCommerz
   * @returns {Promise<Object>} - Processing result
   */
  async processIPN(ipnData) {
    const { val_id, tran_id, status, amount } = ipnData;
    
    try {
      this.logger.info('Processing IPN', { tran_id, status, val_id });
      
      // Validate the IPN with SSLCommerz
      const validation = await this.validatePayment(val_id, tran_id);
      
      if (!validation.isValid) {
        this.logger.warn('IPN validation failed', { tran_id, val_id });
        return {
          success: false,
          message: 'IPN validation failed',
        };
      }
      
      // Check if amounts match
      if (parseFloat(validation.data.amount) !== parseFloat(amount)) {
        this.logger.error('IPN amount mismatch', { 
          tran_id, 
          ipnAmount: amount, 
          validatedAmount: validation.data.amount 
        });
        
        return {
          success: false,
          message: 'Amount mismatch',
        };
      }
      
      return {
        success: true,
        data: validation.data,
      };
    } catch (error) {
      this.logger.error('IPN processing error', { tran_id, error: error.message });
      throw error;
    }
  }
}

module.exports = SSLCommerzService;
