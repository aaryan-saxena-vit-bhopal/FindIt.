'use strict';

const COLLEGE_EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(edu|ac\.in|edu\.in)$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateRegister(body) {
  const errors = {};
  const email = str(body.email).toLowerCase();
  const name = str(body.name);
  const password = typeof body.password === 'string' ? body.password : '';
  const countryCode = str(body.countryCode) || '+91';
  const phone = str(body.phone).replace(/[\s-]/g, '');

  if (!COLLEGE_EMAIL.test(email) || email.length > 254) {
    errors.email = 'Use your official college email (.edu, .ac.in or .edu.in).';
  }
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2-80 characters.';
  if (password.length < 8 || password.length > 128) errors.password = 'Password must be 8-128 characters.';
  if (countryCode !== '+91') errors.countryCode = 'Only +91 is supported.';
  if (!/^[0-9]{10}$/.test(phone)) errors.phone = 'Mobile number must be exactly 10 digits.';

  return { errors, value: { email, name, password, phone: `${countryCode}${phone}` } };
}

function validateLogin(body) {
  const errors = {};
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!COLLEGE_EMAIL.test(email)) errors.email = 'Use your official college email.';
  if (!password) errors.password = 'Password is required.';
  return { errors, value: { email, password, remember: body.remember === true } };
}

module.exports = { validateRegister, validateLogin };
