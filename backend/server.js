const PDFDocument = require("pdfkit");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// =====================================
// HOME ROUTE
// =====================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CampusConnect 360 Backend is running!"
  });
});

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "CampusConnect 360 API"
  });
});

// =====================================
// DATABASE CHECK
// =====================================

app.get("/api/db-check", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "Database connected successfully!",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error("Database error:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed."
    });
  }
});

// =====================================
// GET ALL SERVICE FEES
// =====================================

app.get("/api/service-fees", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM service_fees ORDER BY service_name ASC"
    );

    res.json({
      success: true,
      total: result.rowCount,
      services: result.rows
    });
  } catch (error) {
    console.error("Fetch service fees error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch service fees."
    });
  }
});

// =====================================
// UPDATE SERVICE FEE (ADMIN)
// =====================================

app.put("/api/admin/service-fees/:serviceName", verifyAdmin, async (req, res) => {
  try {
    const serviceName = req.params.serviceName;
    const fee = req.body.fee;

    if (
      fee === undefined ||
      fee === null ||
      fee === "" ||
      !Number.isFinite(Number(fee)) ||
      Number(fee) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid fee."
      });
    }

    const result = await pool.query(
      `UPDATE service_fees
       SET fee = $1, updated_at = NOW()
       WHERE service_name = $2
       RETURNING *`,
      [Number(fee), serviceName]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found."
      });
    }

    res.json({
      success: true,
      message: "Service fee updated successfully!",
      service: result.rows[0]
    });
  } catch (error) {
    console.error("Update fee error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not update service fee."
    });
  }
});

// =====================================
// SUBMIT STUDENT APPLICATION
// =====================================


app.post("/api/applications", verifyStudent, async (req, res) => {
  try {
    const {
      service_name,
      semester,
      subject_count,
      quantity,
      reason
    } = req.body;

    // Fetch verified student details
    const studentResult = await pool.query(
      `SELECT student_name, student_usn, student_email, department
       FROM students
       WHERE id = $1`,
      [req.student.studentId]
    );

    if (studentResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Student account not found."
      });
    }

    const student = studentResult.rows[0];

    // Allowed services
    const allowedServices = [
      "Semester Registration",
      "Backlog / Supplementary Exam",
      "Revaluation Application",
      "Answer Script Photocopy",
      "Bonafide Certificate",
      "Fee Structure",
      "Record",
      "Observation",
      "Assignment"
    ];

    if (
      typeof service_name !== "string" ||
      !allowedServices.includes(service_name.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid service selected."
      });
    }

    const selectedService = service_name.trim();

    // Validate semester
    const semesterNumber = Number(semester);

    if (
      semester === undefined ||
      semester === null ||
      semester === "" ||
      !Number.isInteger(semesterNumber) ||
      semesterNumber < 1 ||
      semesterNumber > 8
    ) {
      return res.status(400).json({
        success: false,
        message: "Semester must be between 1 and 8."
      });
    }

    const subjectCountServices = [
      "Backlog / Supplementary Exam",
      "Revaluation Application",
      "Answer Script Photocopy"
    ];

    const quantityBasedServices = [
      "Record",
      "Observation",
      "Assignment"
    ];

    let subjectNumber = null;
    let quantityNumber = null;

    // Subject count validation
    if (subjectCountServices.includes(selectedService)) {
      subjectNumber = Number(subject_count);

      if (
        subject_count === undefined ||
        subject_count === null ||
        subject_count === "" ||
        !Number.isInteger(subjectNumber) ||
        subjectNumber < 1 ||
        subjectNumber > 20
      ) {
        return res.status(400).json({
          success: false,
          message: "Subject count must be between 1 and 20."
        });
      }
    } else if (
      subject_count !== undefined &&
      subject_count !== null &&
      subject_count !== ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Subject count is not required for this service."
      });
    }

    // Quantity validation
    if (quantityBasedServices.includes(selectedService)) {
      quantityNumber = Number(quantity);

      if (
        quantity === undefined ||
        quantity === null ||
        quantity === "" ||
        !Number.isInteger(quantityNumber) ||
        quantityNumber < 1 ||
        quantityNumber > 20
      ) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be between 1 and 20."
        });
      }
    } else if (
      quantity !== undefined &&
      quantity !== null &&
      quantity !== ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantity is not required for this service."
      });
    }

    // Fetch fee configured by admin
    const feeResult = await pool.query(
      `SELECT fee
       FROM service_fees
       WHERE service_name = $1`,
      [selectedService]
    );

    if (feeResult.rowCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Service fee not configured."
      });
    }

    const baseFee = Number(feeResult.rows[0].fee);

    if (!Number.isFinite(baseFee) || baseFee < 0) {
      return res.status(500).json({
        success: false,
        message: "Invalid service fee configuration."
      });
    }

    // Calculate final fee
    const serviceFee = quantityBasedServices.includes(selectedService)
      ? baseFee * quantityNumber
      : baseFee;

    // Insert application
    const result = await pool.query(
      `INSERT INTO applications (
        student_name,
        student_usn,
        student_email,
        department,
        service_name,
        semester,
        subject_count,
        quantity,
        reason,
        fee
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        student.student_name,
        student.student_usn,
        student.student_email,
        student.department,
        selectedService,
        semesterNumber,
        subjectNumber,
        quantityNumber,
        typeof reason === "string" ? reason.trim() || null : null,
        serviceFee
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully!",
      application: result.rows[0]
    });

  } catch (error) {
    console.error("Application submission error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not submit application."
    });
  }
});

// =====================================
// CREATE RAZORPAY PAYMENT ORDER
// =====================================

app.post("/api/payment/create-order", verifyStudent, async (req, res) => {
  try {
    console.log("MY UPDATED PAYMENT ROUTE IS RUNNING");
    const applicationId = Number(req.body.application_id);

    if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid application ID is required."
      });
    }

    // The application must belong to the currently logged-in student.
    console.log("PAYMENT OWNERSHIP CHECK:", {
  applicationId,
  loggedInStudentId: req.student.studentId,
  loggedInUSN: req.student.usn
});
   const result = await pool.query(
  `SELECT a.id, a.service_name, a.fee, a.payment_status,
          a.application_status, s.id AS student_id
   FROM applications a
   INNER JOIN students s ON s.student_usn = a.student_usn
   WHERE a.id = $1 AND s.id = $2`,
  [applicationId, req.student.studentId]
);

console.log("DATABASE OWNERSHIP RESULT:", {
  rowCount: result.rowCount,
  matchedStudentId: result.rows[0]?.student_id
});
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found for this student."
      });
    }

    const application = result.rows[0];

    if (application.payment_status === "paid") {
      return res.status(409).json({
        success: false,
        message: "This application is already paid."
      });
    }

    if (application.application_status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "This application is no longer available for payment."
      });
    }

    const amountInPaise = Math.round(Number(application.fee) * 100);

    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Application fee must be greater than zero. Ask the administrator to set the service fee."
      });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `application_${application.id}`,
      notes: {
        application_id: String(application.id),
        service_name: application.service_name,
        student_id: String(req.student.studentId)
      }
    });

    await pool.query(
      `UPDATE applications
       SET razorpay_order_id = $1
       WHERE id = $2 AND payment_status <> 'paid'`,
      [order.id, application.id]
    );

    return res.json({
      success: true,
      message: "Payment order created successfully.",
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
        application_id: application.id
      }
    });

  } catch (error) {
    console.error("Create payment order full error:", error);
console.error("Razorpay error details:", {
  statusCode: error?.statusCode,
  description: error?.error?.description,
  code: error?.error?.code,
  reason: error?.error?.reason
});

    return res.status(500).json({
      success: false,
      message: "Could not create payment order."
    });
  }
});

// =====================================
// VERIFY RAZORPAY PAYMENT
// =====================================


// =====================================
// VERIFY RAZORPAY PAYMENT
// =====================================

// =====================================
// VERIFY RAZORPAY PAYMENT
// =====================================

app.post("/api/payment/verify", verifyStudent, async (req, res) => {
  try {
    const {
      application_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const applicationId = Number(application_id);

    // Validate incoming payment details
    if (
      !Number.isSafeInteger(applicationId) ||
      applicationId <= 0 ||
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string" ||
      !/^pay_[a-zA-Z0-9]+$/.test(razorpay_payment_id) ||
      !/^[a-fA-F0-9]{64}$/.test(razorpay_signature)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid application and payment details are required."
      });
    }

    // Check application ownership
    const result = await pool.query(
      `SELECT a.id, a.fee, a.payment_status,
              a.razorpay_order_id, a.application_status
       FROM applications a
       INNER JOIN students s ON s.student_usn = a.student_usn
       WHERE a.id = $1 AND s.id = $2`,
      [applicationId, req.student.studentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found for this student."
      });
    }

    const application = result.rows[0];

    // Prevent duplicate payment verification
    if (application.payment_status === "paid") {
      return res.status(409).json({
        success: false,
        message: "This application is already paid."
      });
    }

    // Only pending applications can be paid
    if (application.application_status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "This application is no longer awaiting payment."
      });
    }

    // Check order ID
    if (
      !application.razorpay_order_id ||
      application.razorpay_order_id !== razorpay_order_id
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment order does not match this application."
      });
    }

    // Check Razorpay secret configuration
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error("RAZORPAY_KEY_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Payment verification is not configured."
      });
    }

    // Generate Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureBuffer = Buffer.from(generatedSignature, "hex");
    const receivedBuffer = Buffer.from(razorpay_signature, "hex");

    // Compare signatures safely
    if (
      signatureBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, receivedBuffer)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed."
      });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    const expectedAmount = Math.round(Number(application.fee) * 100);

    // Verify payment status, order and amount
    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.currency !== "INR" ||
      payment.amount !== expectedAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment is not successfully captured or the amount does not match."
      });
    }

    // Final update with ownership and order checks
    const updateResult = await pool.query(
      `UPDATE applications a
       SET payment_status = 'paid',
           razorpay_payment_id = $1,
           payment_verified_at = NOW()
       FROM students s
       WHERE a.id = $2
         AND a.student_usn = s.student_usn
         AND s.id = $3
         AND a.razorpay_order_id = $4
         AND a.payment_status <> 'paid'
         AND a.application_status = 'pending'
       RETURNING a.id, a.payment_status`,
      [
        razorpay_payment_id,
        applicationId,
        req.student.studentId,
        razorpay_order_id
      ]
    );

    if (updateResult.rowCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Payment was already processed or could not be updated. Refresh your dashboard."
      });
    }

    return res.json({
      success: true,
      message: "Payment verified successfully!",
      application: updateResult.rows[0]
    });

  } catch (error) {
    console.error("Payment verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not verify payment."
    });
  }
});


// =====================================
// ADMIN APPROVE APPLICATION + GENERATE SLIP ID
// =====================================

// Your existing Admin Approval route continues below.

// =====================================
// ADMIN APPROVE APPLICATION + GENERATE SLIP ID
// =====================================

app.post("/api/admin/applications/:id/approve", verifyAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const applicationId = Number(req.params.id);

    if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid application ID is required."
      });
    }

    await client.query("BEGIN");

    // Lock application so it cannot be approved twice simultaneously
    const result = await client.query(
      `SELECT id, student_usn, payment_status, application_status, slip_id
       FROM applications
       WHERE id = $1
       FOR UPDATE`,
      [applicationId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    const application = result.rows[0];

    if (application.payment_status !== "paid") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Payment must be completed before approval."
      });
    }

    if (application.application_status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "This application has already been processed."
      });
    }

    // Generate next sequence number for this student
    const counterResult = await client.query(
      `INSERT INTO student_slip_counters (student_usn, last_number)
       VALUES ($1, 1)
       ON CONFLICT (student_usn)
       DO UPDATE SET
         last_number = student_slip_counters.last_number + 1
       RETURNING last_number`,
      [application.student_usn]
    );

    const sequenceNumber = counterResult.rows[0].last_number;

    // Create unique slip ID
    const safeUSN = application.student_usn
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();

    const slipId = `${safeUSN}-${String(sequenceNumber).padStart(4, "0")}`;

    // Approve application and save slip ID
    const updateResult = await client.query(
      `UPDATE applications
       SET application_status = 'approved',
           slip_id = $1
       WHERE id = $2
       RETURNING *`,
      [slipId, applicationId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Application approved successfully!",
      application: updateResult.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Application approval error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not approve application."
    });

  } finally {
    client.release();
  }
});
// =====================================
// GET APPLICATIONS FOR LOGGED-IN STUDENT
// =====================================

app.get("/api/student/applications", verifyStudent, async (req, res) => {
  try {
    const studentId = req.student.studentId;

    // Get registered student details using JWT identity
    const studentResult = await pool.query(
      `SELECT student_usn, student_email
       FROM students
       WHERE id = $1`,
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student account not found."
      });
    }

    const { student_usn, student_email } = studentResult.rows[0];

    const result = await pool.query(
      `SELECT
        id,
        student_name,
        student_usn,
        student_email,
        department,
        service_name,
        semester,
        subject_count,
        quantity,
        reason,
        fee,
        payment_status,
        application_status,
        slip_id,
        created_at
      FROM applications
      WHERE LOWER(TRIM(student_usn)) = LOWER(TRIM($1))
      AND LOWER(TRIM(student_email)) = LOWER(TRIM($2))
      ORDER BY created_at DESC`,
      [student_usn, student_email]
    );

    return res.json({
      success: true,
      total: result.rowCount,
      applications: result.rows
    });

  } catch (error) {
    console.error("Student applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not fetch student applications."
    });
  }
});

// =====================================
// GET ALL APPLICATIONS
// =====================================

app.get("/api/applications", verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM applications ORDER BY created_at DESC"
    );

    res.json({
      success: true,
      total: result.rowCount,
      applications: result.rows
    });

  } catch (error) {
    console.error("Fetch applications error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch applications."
    });
  }
});
// =====================================
// DOWNLOAD APPROVED APPLICATION SLIP
// =====================================

app.get("/api/admin/applications/:id/slip", verifyAdmin, async (req, res) => {
  try {
    const applicationId = Number(req.params.id);

    if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID."
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        student_name,
        student_usn,
        student_email,
        department,
        service_name,
        semester,
        subject_count,
        quantity,
        fee,
        payment_status,
        application_status,
        slip_id,
        created_at
       FROM applications
       WHERE id = $1`,
      [applicationId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    const application = result.rows[0];

    if (
      application.payment_status !== "paid" ||
      application.application_status !== "approved" ||
      !application.slip_id
    ) {
      return res.status(403).json({
        success: false,
        message: "PDF is available only after payment and approval."
      });
    }

    const doc = new PDFDocument({
      size: "A4",
      margin: 50
    });

    const fileName = `CampusConnect_Slip_${application.slip_id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    doc.pipe(res);

    // College heading
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("CAMPUSCONNECT 360", { align: "center" });

    doc
      .moveDown(0.3)
      .fontSize(11)
      .font("Helvetica")
      .text("College Student Service Management System", {
        align: "center"
      });

    doc.moveDown(1);

    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("APPLICATION APPROVAL SLIP", {
        align: "center",
        underline: true
      });

    doc.moveDown(1.5);

    // Slip details
    doc.fontSize(12).font("Helvetica");

    const details = [
      ["Slip ID", application.slip_id],
      ["Application ID", application.id],
      ["Student Name", application.student_name],
      ["USN", application.student_usn],
      ["Email", application.student_email],
      ["Department", application.department || "N/A"],
      ["Service", application.service_name],
      ["Semester", application.semester],
      ["Subject Count", application.subject_count ?? "N/A"],
      ["Quantity", application.quantity ?? "N/A"],
      ["Fee Paid", `INR ${Number(application.fee).toFixed(2)}`],
      ["Payment Status", "PAID - VERIFIED"],
      ["Application Status", "APPROVED"],
      [
        "Approval Date",
        new Date(application.created_at).toLocaleDateString("en-IN")
      ]
    ];

    details.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").text(`${label}: `, {
        continued: true
      });

      doc.font("Helvetica").text(String(value));
      doc.moveDown(0.6);
    });

    doc.moveDown(2);

    doc
      .fontSize(10)
      .text(
        "This is a computer-generated application approval slip.",
        { align: "center" }
      );

    doc.moveDown(0.5);

    doc.text("Generated by CampusConnect 360", {
      align: "center"
    });

    doc.end();

  } catch (error) {
    console.error("PDF generation error:", error.message);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Could not generate PDF slip."
      });
    } else {
      res.destroy(error);
    }
  }
});
// =====================================
// DOWNLOAD STUDENT APPROVED SLIP
// =====================================

app.get(
  "/api/student/applications/:id/slip",
  verifyStudent,
  async (req, res) => {
    try {
      const applicationId = Number(req.params.id);

      if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid application ID."
        });
      }

      // Fetch only the logged-in student's application
      const result = await pool.query(
        `SELECT
          a.id,
          a.student_name,
          a.student_usn,
          a.student_email,
          a.department,
          a.service_name,
          a.semester,
          a.subject_count,
          a.quantity,
          a.fee,
          a.payment_status,
          a.application_status,
          a.slip_id,
          a.created_at
         FROM applications a
         INNER JOIN students s
           ON a.student_usn = s.student_usn
         WHERE a.id = $1
           AND s.id = $2`,
        [applicationId, req.student.studentId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Application not found."
        });
      }

      const application = result.rows[0];

      if (
        application.payment_status !== "paid" ||
        application.application_status !== "approved" ||
        !application.slip_id
      ) {
        return res.status(403).json({
          success: false,
          message: "PDF is available only after payment and approval."
        });
      }

      const doc = new PDFDocument({
        size: "A4",
        margin: 50
      });

      const fileName =
        `CampusConnect_Slip_${application.slip_id}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );

      doc.pipe(res);

      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .text("CAMPUSCONNECT 360", { align: "center" });

      doc
        .moveDown(0.3)
        .fontSize(11)
        .font("Helvetica")
        .text("College Student Service Management System", {
          align: "center"
        });

      doc.moveDown(1);

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("APPLICATION APPROVAL SLIP", {
          align: "center",
          underline: true
        });

      doc.moveDown(1.5);
      doc.fontSize(12).font("Helvetica");

      const details = [
        ["Slip ID", application.slip_id],
        ["Application ID", application.id],
        ["Student Name", application.student_name],
        ["USN", application.student_usn],
        ["Email", application.student_email],
        ["Department", application.department || "N/A"],
        ["Service", application.service_name],
        ["Semester", application.semester],
        ["Subject Count", application.subject_count ?? "N/A"],
        ["Quantity", application.quantity ?? "N/A"],
        ["Fee Paid", `INR ${Number(application.fee).toFixed(2)}`],
        ["Payment Status", "PAID - VERIFIED"],
        ["Application Status", "APPROVED"],
        [
          "Application Date",
          new Date(application.created_at).toLocaleDateString("en-IN")
        ]
      ];

      details.forEach(([label, value]) => {
        doc.font("Helvetica-Bold").text(`${label}: `, {
          continued: true
        });

        doc.font("Helvetica").text(String(value));
        doc.moveDown(0.6);
      });

      doc.moveDown(2);

      doc
        .fontSize(10)
        .text(
          "This is a computer-generated application approval slip.",
          { align: "center" }
        );

      doc.moveDown(0.5);

      doc.text("Generated by CampusConnect 360", {
        align: "center"
      });

      doc.end();

    } catch (error) {
      console.error("Student PDF error:", error.message);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Could not generate PDF slip."
        });
      } else {
        res.destroy(error);
      }
    }
  }
);
// =====================================
// ADMIN AUTHENTICATION MIDDLEWARE
// =====================================

function verifyAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Access denied. Please login as admin."
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (decoded.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required."
      });
    }

    req.admin = decoded;
    next();

  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired login session."
    });
  }
}
// =====================================
// STUDENT AUTHENTICATION MIDDLEWARE
// =====================================

function verifyStudent(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Please login as a student."
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (decoded.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Student access required."
      });
    }

    req.student = decoded;
    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired student login session."
    });
  }
}
// =====================================
// ADMIN LOGIN API
// =====================================

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required."
      });
    }

    const result = await pool.query(
      "SELECT * FROM admins WHERE username = $1",
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid username or password."
      });
    }

    const admin = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid username or password."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server authentication is not configured."
      });
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: "admin"
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      message: "Admin login successful.",
      token,
      username: admin.username
    });

  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      message: "Internal server error."
    });
  }
});
// =====================================
// STUDENT REGISTRATION API
// =====================================

app.post("/api/student/register", async (req, res) => {
  try {
    const {
      student_name,
      student_usn,
      student_email,
      department,
      semester,
      password
    } = req.body;

    // Check required fields
    if (
      !student_name ||
      !student_usn ||
      !student_email ||
      !department ||
      !semester ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required."
      });
    }

    // Validate password
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    // Validate semester
    const semesterNumber = Number(semester);

    if (
      !Number.isInteger(semesterNumber) ||
      semesterNumber < 1 ||
      semesterNumber > 8
    ) {
      return res.status(400).json({
        success: false,
        message: "Semester must be between 1 and 8."
      });
    }

    // Normalize student details
    const name = student_name.trim();
    const usn = student_usn.trim().toUpperCase();
    const email = student_email.trim().toLowerCase();
    const studentDepartment = department.trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Save student in database
    const result = await pool.query(
      `INSERT INTO students
       (student_name, student_usn, student_email,
        department, semester, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, student_name, student_usn,
                 student_email, department, semester, created_at`,
      [
        name,
        usn,
        email,
        studentDepartment,
        semesterNumber,
        passwordHash
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Student registration successful!",
      student: result.rows[0]
    });

  } catch (error) {
    console.error("Student registration error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This USN or email is already registered."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again."
    });
  }
});
// =====================================
// STUDENT LOGIN API
// =====================================

app.post("/api/student/login", async (req, res) => {
  try {
    const { student_email, password } = req.body;

    if (!student_email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const email = student_email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT * FROM students WHERE student_email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const student = result.rows[0];

    const isMatch = await bcrypt.compare(
      password,
      student.password_hash
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const token = jwt.sign(
      {
        studentId: student.id,
        usn: student.student_usn,
        role: "student"
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      success: true,
      message: "Student login successful!",
      token,
      student: {
        id: student.id,
        student_name: student.student_name,
        student_usn: student.student_usn,
        student_email: student.student_email,
        department: student.department,
        semester: student.semester
      }
    });

  } catch (error) {
    console.error("Student login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again."
    });
  }
});
// =====================================
// HANDLE UNKNOWN ROUTES
// =====================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found."
  });
});

// =====================================
// ERROR HANDLER
// =====================================

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// =====================================
// START SERVER
// =====================================

const server = app.listen(PORT, () => {
  console.log("------------------------------------");
  console.log("CampusConnect 360 Backend Started!");
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log("------------------------------------");
});

server.on("error", (error) => {
  console.error("Server startup error:", error.message);
});

// =====================================
// GRACEFUL SHUTDOWN
// =====================================

process.on("SIGINT", () => {
  console.log("\nShutting down backend...");

  server.close(async () => {
    await pool.end();

    console.log("Backend stopped successfully.");

    process.exit(0);
  });
});