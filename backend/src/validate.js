'use strict';

const COLLEGE_EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(edu|ac\.in|edu\.in)$/;

const CATEGORIES = [
  'Electronics',
  'Documents & Cards',
  'Clothing & Accessories',
  'Keys',
  'Bags & Luggage',
  'Jewelry',
  'Books & Stationery',
];

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

function validateItem(body) {
  const errors = {};
  const type = str(body.type);
  const name = str(body.name);
  const categoryRaw = str(body.category);
  const customCategory = str(body.customCategory);
  const date = str(body.date);
  const location = str(body.location);
  const contactInfo = str(body.contactInfo);
  const description = str(body.description);

  if (type !== 'lost' && type !== 'found') errors.type = 'Type must be "lost" or "found".';
  if (!name || name.length > 100) errors.name = 'Item name is required (max 100 characters).';

  let category = categoryRaw;
  let isCustom = false;
  if (categoryRaw === 'Custom') {
    isCustom = true;
    category = customCategory;
    if (!category || category.length > 40) errors.customCategory = 'Custom category is required (max 40 characters).';
  } else if (!CATEGORIES.includes(categoryRaw)) {
    errors.category = 'Choose a valid category.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    errors.date = 'Date must be in YYYY-MM-DD format.';
  } else {
    const limit = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    if (date > limit) errors.date = 'Date cannot be in the future.';
  }

  if (!location || location.length > 100) errors.location = 'Location is required (max 100 characters).';
  if (contactInfo.length > 100) errors.contactInfo = 'Contact info is too long (max 100 characters).';
  if (description.length > 500) errors.description = 'Description is too long (max 500 characters).';

  return { errors, value: { type, name, category, isCustom, date, location, contactInfo, description } };
}

module.exports = { validateRegister, validateLogin, validateItem, CATEGORIES };
