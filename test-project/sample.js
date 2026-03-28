// Sample JavaScript file for testing call graph

function processOrder(orderId) {
  validateOrder(orderId);
  const order = fetchOrder(orderId);
  calculateTotal(order);
  saveOrder(order);
  sendConfirmation(orderId);
}

function validateOrder(orderId) {
  if (!orderId) {
    throw new Error('Invalid order ID');
  }
}

function fetchOrder(orderId) {
  return { id: orderId, items: [] };
}

function calculateTotal(order) {
  let total = 0;
  for (const item of order.items) {
    total += item.price;
  }
  order.total = total;
  return total;
}

function saveOrder(order) {
  console.log('Saving order:', order);
}

function sendConfirmation(orderId) {
  const email = getCustomerEmail(orderId);
  sendEmail(email, 'Order confirmed');
}

function getCustomerEmail(orderId) {
  return 'customer@example.com';
}

function sendEmail(email, message) {
  console.log(`Sending email to ${email}: ${message}`);
}

// Entry point
function main() {
  processOrder('12345');
}

main();
