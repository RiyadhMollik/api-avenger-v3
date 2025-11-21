const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Serve static files including node_modules for socket.io client
app.use(express.static(__dirname));
app.use('/socket.io', express.static(path.join(__dirname, '../node_modules/socket.io/client-dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/payment-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment-success.html'));
});

app.get('/payment-failed', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment-failed.html'));
});

app.get('/payment-cancelled', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment-cancelled.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});
