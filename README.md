# CampusConnect 360 🎓

**A College Service Management Platform**

CampusConnect 360 is a web-based college service management system designed to simplify how students apply for academic and general college services.

The platform reduces manual paperwork and unnecessary office visits by allowing students to submit applications online, make payments, and track their application status.

## 🚀 Features

### Student Features
- Student registration and login
- Online application submission
- Academic and general college services
- Application status tracking
- Online payment integration
- Downloadable application approval slips in PDF format

### Admin Features
- Secure admin login
- View and manage student applications
- Verify payments
- Approve eligible applications
- Configure service fees
- Generate unique student-wise slip IDs

## 📚 Available Services

**Academic Services**
- Semester Registration
- Backlog / Supplementary Exam
- Revaluation Application
- Answer Script Photocopy

**General College Services**
- Bonafide Certificate
- Fee Structure
- Record
- Observation
- Assignment

## 🛠️ Technologies Used

- HTML5
- CSS3
- JavaScript
- Node.js
- Express.js
- PostgreSQL
- Razorpay (Test Mode)

## ⚙️ Project Setup

### 1. Clone the repository

```bash
git clone https://github.com/saurabhraj-hash/CampusConnect360.git
cd CampusConnect360
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Configure environment variables

Create a `.env` file inside the `backend` folder.

Add your own database and payment configuration. Never upload this file to GitHub.

### 4. Configure PostgreSQL

Create the `campusconnect360` database and configure the database connection using your environment variables.

### 5. Start the backend

```bash
node server.js
```

### 6. Open the frontend

Open `index.html` using your browser or a local development server.

## 🔐 Security

- JWT-based student authentication
- Role-based access control
- Student-specific application access
- Payment signature verification
- Server-side fee calculation
- Environment variables for sensitive credentials

## 🎯 Project Objective

The main objective of CampusConnect 360 is to make college services more accessible, efficient, and organized through a centralized digital platform.

## 🔮 Future Improvements

- Production payment gateway integration
- Cloud deployment
- Email and SMS notifications
- Advanced admin analytics
- Mobile-friendly improvements

## 👨‍💻 Developer

**Saurabh Raj**

GitHub: [saurabhraj-hash](https://github.com/saurabhraj-hash)

---

*CampusConnect 360 — Making College Services Smarter and Simpler.*
