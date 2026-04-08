// HTX(Huobi) 실거래 주문 래퍼 스켈레톤 - 현물 전용
// ⚠️  이 파일은 기본 스켈레톤입니다. 실거래 전 반드시 소액/샌드박스 검증 필수.
// Docs: https://huobiapi.github.io/docs/spot/v1/en/#place-a-new-order
const axios = require('axios');
const crypto = require('crypto');

const HOST = 'api.huobi.pro';
const BASE = `https://${HOST}`;

class HTXTrader {
  constructor({ accessKey, secretKey, accountId, dryRun = true }) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.accountId = accountId;
    this.dryRun = dryRun;
  }

  _sign(method, pathname, params) {
    const sorted = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    const payload = [method.toUpperCase(), HOST, pathname, sorted].join('\n');
    const signature = crypto.createHmac('sha256', this.secretKey).update(payload).digest('base64');
    return `${sorted}&Signature=${encodeURIComponent(signature)}`;
  }

  async _signedRequest(method, pathname, params = {}, body = null) {
    const base = {
      AccessKeyId: this.accessKey,
      SignatureMethod: 'HmacSHA256',
      SignatureVersion: '2',
      Timestamp: new Date().toISOString().replace(/\..+/, ''),
    };
    const full = { ...base, ...params };
    const query = this._sign(method, pathname, full);
    const url = `${BASE}${pathname}?${query}`;
    if (method === 'GET') return (await axios.get(url)).data;
    return (await axios.post(url, body || {}, { headers: { 'Content-Type': 'application/json' } })).data;
  }

  async getAccounts() { return this._signedRequest('GET', '/v1/account/accounts'); }
  async getBalance() { return this._signedRequest('GET', `/v1/account/accounts/${this.accountId}/balance`); }

  /**
   * 시장가 매수/매도
   * @param {string} symbol 'btcusdt'
   * @param {'buy'|'sell'} side
   * @param {number} amount buy=quote USDT 금액 / sell=base coin 수량 (HTX 규격)
   */
  async marketOrder(symbol, side, amount) {
    const order = {
      'account-id': String(this.accountId),
      symbol,
      type: `${side}-market`,
      amount: String(amount),
      source: 'spot-api',
    };
    if (this.dryRun) {
      console.log('[DRY-RUN] 주문:', order);
      return { status: 'dry-run', order };
    }
    return this._signedRequest('POST', '/v1/order/orders/place', {}, order);
  }
}

// 사용 예시:
// const t = new HTXTrader({ accessKey: process.env.HTX_KEY, secretKey: process.env.HTX_SECRET, accountId: process.env.HTX_ACC, dryRun: true });
// await t.marketOrder('btcusdt', 'buy', '20'); // 20 USDT 매수

module.exports = HTXTrader;
