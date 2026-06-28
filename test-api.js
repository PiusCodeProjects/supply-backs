const jwt = require('jsonwebtoken');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: './apps/api/.env' });

const token = jwt.sign(
  { sub: 'cmoplq3d50000ozaq5mz0bypq', email: 'admin@cscp.dev', role: 'ADMIN', isVerified: true },
  process.env.JWT_SECRET || 'cscp-jwt-secret-change-in-production-min-32-chars',
  { expiresIn: '1h' }
);

fetch('http://localhost:4001/api/users', {
  headers: { Authorization: `Bearer ${token}` }
})
.then(r => r.text())
.then(text => console.log('Response:', text))
.catch(console.error);
