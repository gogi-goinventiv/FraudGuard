interface TransactionResponse {
    transactions: Transaction[];
  }
  
  interface Transaction {
    id: number;
    order_id: number;
    kind: string;
    gateway: string;
    status: string;
    message: string;
    created_at: string;
    test: boolean;
    authorization: null | string;
    location_id: null;
    user_id: null;
    parent_id: null | number;
    processed_at: string;
    device_id: null;
    error_code: null | string;
    source_name: string;
    payment_details: Paymentdetails;
    receipt: Receipt;
    amount: string;
    currency: string;
    payment_id: string;
    total_unsettled_set: Totalunsettledset;
    manual_payment_gateway: boolean;
    amount_rounding: null;
    admin_graphql_api_id: string;
  }
  
  interface Totalunsettledset {
    presentment_money: Presentmentmoney;
    shop_money: Presentmentmoney;
  }
  
  interface Presentmentmoney {
    amount: string;
    currency: string;
  }
  
  interface Receipt {
    message?: string;
    authorized_amount?: string;
    error?: string;
    error_code?: string;
    paid_amount?: string;
  }
  
  interface Paymentdetails {
    credit_card_bin: string;
    avs_result_code: null;
    cvv_result_code: null;
    credit_card_number: string;
    credit_card_company: string;
    buyer_action_info: null;
    credit_card_name: string;
    credit_card_wallet: null;
    credit_card_expiration_month: number;
    credit_card_expiration_year: number;
    payment_method_name: string;
  }