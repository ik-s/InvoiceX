require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INVOICE_STORAGE_BUCKET = process.env.INVOICE_STORAGE_BUCKET || 'invoice-documents';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

const ALLOWED_STATUS = new Set([
  'needs_review',
  'admin_pending',
  'rejected',
  'supplement_requested',
  'rwa_approved'
]);

function normalizeAmount(value) {
  const numeric = Number(String(value || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function generatePublicId() {
  const year = new Date().getFullYear();
  const serial = String(Date.now()).slice(-6);
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `#INV-${year}-${serial}${rand}`;
}

function cleanPublicId(raw) {
  return decodeURIComponent(String(raw || '')).trim();
}

function toClientInvoice(row) {
  if (!row) return null;
  return {
    id: row.public_id,
    public_id: row.public_id,
    uuid: row.id,
    issuer_name: row.issuer_name,
    buyer_name: row.buyer_name,
    buyer_email: row.buyer_email,
    amount: row.amount,
    currency: row.currency,
    due_date: row.due_date,
    delivery_date: row.delivery_date,
    description: row.description,
    file_name: row.file_name,
    file_mime_type: row.file_mime_type,
    file_size_bytes: row.file_size_bytes,
    doc_url: row.doc_url,
    status: row.status,
    admin_approval: row.admin_approval,
    passport_issued: row.passport_issued,
    risk_grade: row.risk_grade,
    admin_memo: row.admin_memo,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ensureInvoiceBucket() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (buckets.some((bucket) => bucket.name === INVOICE_STORAGE_BUCKET)) return;

  const { error: createError } = await supabase.storage.createBucket(INVOICE_STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg']
  });
  if (createError && !String(createError.message || '').includes('already exists')) throw createError;
}

async function uploadInvoiceDocument(publicId, file) {
  if (!file) return null;

  await ensureInvoiceBucket();
  const safeId = publicId.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = file.originalname && file.originalname.includes('.')
    ? file.originalname.split('.').pop().toLowerCase()
    : 'bin';
  const objectPath = `${safeId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(INVOICE_STORAGE_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(INVOICE_STORAGE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

function requireFields(fields) {
  const missing = Object.entries(fields)
    .filter(([, value]) => value === undefined || value === null || String(value).trim() === '')
    .map(([key]) => key);
  if (missing.length) {
    const error = new Error(`필수 값이 누락되었습니다: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'InvoiceX backend', storageBucket: INVOICE_STORAGE_BUCKET });
});

app.post('/api/invoices', upload.single('document'), async (req, res, next) => {
  try {
    const buyerName = req.body.buyerName || req.body.buyer_name;
    const buyerEmail = req.body.buyerEmail || req.body.buyer_email;
    const invoiceAmount = req.body.invoiceAmount || req.body.amount;
    const dueDate = req.body.dueDate || req.body.due_date;
    const deliveryDate = req.body.deliveryDate || req.body.delivery_date;
    const invoiceDesc = req.body.invoiceDesc || req.body.description;
    const issuerName = req.body.issuerName || req.body.issuer_name || 'InvoiceX 등록기업';
    const currency = req.body.currency || 'KRW';

    requireFields({ buyerName, buyerEmail, invoiceAmount, dueDate, deliveryDate, invoiceDesc, issuerName });

    const amount = normalizeAmount(invoiceAmount);
    if (amount <= 0) {
      return res.status(400).json({ message: '인보이스 금액이 올바르지 않습니다.' });
    }

    const publicId = generatePublicId();
    let docUrl = null;
    if (req.file) {
      docUrl = await uploadInvoiceDocument(publicId, req.file);
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        public_id: publicId,
        issuer_name: issuerName,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        amount,
        currency,
        due_date: dueDate,
        delivery_date: deliveryDate,
        description: invoiceDesc,
        file_name: req.file?.originalname || null,
        file_mime_type: req.file?.mimetype || null,
        file_size_bytes: req.file?.size || null,
        doc_url: docUrl,
        status: 'needs_review',
        admin_approval: 'none',
        passport_issued: false
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json({ invoice: toClientInvoice(data) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/invoices', async (req, res, next) => {
  try {
    const statuses = String(req.query.status || '')
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);

    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (statuses.length) query = query.in('status', statuses);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ invoices: (data || []).map(toClientInvoice) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/invoices/:publicId', async (req, res, next) => {
  try {
    const publicId = cleanPublicId(req.params.publicId);
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('public_id', publicId)
      .single();

    if (error) throw error;
    res.json({ invoice: toClientInvoice(data) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/invoices/:publicId/status', async (req, res, next) => {
  try {
    const publicId = cleanPublicId(req.params.publicId);
    const status = req.body.status;
    const adminApproval = req.body.adminApproval || req.body.admin_approval;

    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ message: `지원하지 않는 status입니다: ${status}` });
    }

    const patch = { status };
    if (adminApproval) patch.admin_approval = adminApproval;
    if (status === 'admin_pending' && !adminApproval) patch.admin_approval = 'pending';
    if (status === 'rejected' && !adminApproval) patch.admin_approval = 'none';
    if (req.body.rejectReason) patch.admin_memo = req.body.rejectReason;

    const { data, error } = await supabase
      .from('invoices')
      .update(patch)
      .eq('public_id', publicId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ invoice: toClientInvoice(data) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/invoices', async (req, res, next) => {
  try {
    const statuses = String(req.query.status || 'admin_pending')
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);

    let query = supabase.from('invoices').select('*').order('updated_at', { ascending: false });
    if (statuses.length) query = query.in('status', statuses);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ invoices: (data || []).map(toClientInvoice) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invoices/:publicId/passport', async (req, res, next) => {
  try {
    const publicId = cleanPublicId(req.params.publicId);
    const { data, error } = await supabase
      .from('invoices')
      .update({
        passport_issued: true,
        risk_grade: req.body.riskGrade || req.body.risk_grade || 'A'
      })
      .eq('public_id', publicId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ invoice: toClientInvoice(data) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invoices/:publicId/approve-rwa', async (req, res, next) => {
  try {
    const publicId = cleanPublicId(req.params.publicId);
    const { data: current, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('public_id', publicId)
      .single();

    if (fetchError) throw fetchError;
    if (!current.passport_issued) {
      return res.status(400).json({ message: 'Risk Passport 확정 후 RWA 발행 승인이 가능합니다.' });
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'rwa_approved',
        admin_approval: 'approved',
        admin_memo: req.body.memo || current.admin_memo || null
      })
      .eq('public_id', publicId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ invoice: toClientInvoice(data) });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || '서버 오류가 발생했습니다.'
  });
});

app.listen(PORT, () => {
  console.log(`InvoiceX backend listening on http://localhost:${PORT}`);
});
