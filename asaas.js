'use strict';

const BASE_URL = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

async function asaasRequest(method, path, body) {
  const r = await fetch(BASE_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (json.errors && json.errors[0] && json.errors[0].description) || 'Erro na comunicação com o Asaas';
    throw new Error(msg);
  }
  return json;
}

async function findOrCreateCustomer({ externalReference, name, cpfCnpj, email, mobilePhone }) {
  const existing = await asaasRequest('GET', `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`);
  if (existing.data && existing.data.length) return existing.data[0];
  return asaasRequest('POST', '/customers', {
    name, cpfCnpj: cpfCnpj.replace(/\D/g, ''), email, mobilePhone, externalReference,
  });
}

async function createSubscription({ customerId, value, nextDueDate, description, externalReference }) {
  return asaasRequest('POST', '/subscriptions', {
    customer: customerId,
    billingType: 'UNDEFINED',
    value,
    nextDueDate,
    cycle: 'MONTHLY',
    description,
    externalReference,
  });
}

async function getSubscriptionInvoiceUrl(subscriptionId) {
  const payments = await asaasRequest('GET', `/payments?subscription=${subscriptionId}&limit=1`);
  const first = payments.data && payments.data[0];
  return first ? first.invoiceUrl : null;
}

async function cancelSubscription(subscriptionId) {
  // DELETE cancela a assinatura no Asaas: nenhuma cobrança futura e gerada.
  // Uma fatura do ciclo atual que ja tenha sido criada nao e afetada.
  return asaasRequest('DELETE', `/subscriptions/${subscriptionId}`);
}

async function updateSubscriptionValue(subscriptionId, value) {
  return asaasRequest('PUT', `/subscriptions/${subscriptionId}`, { value });
}

module.exports = { findOrCreateCustomer, createSubscription, getSubscriptionInvoiceUrl, cancelSubscription, updateSubscriptionValue };
