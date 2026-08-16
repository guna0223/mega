# Smart Bus Gate Management System

A MERN stack application with real-time Automatic Number Plate Recognition (ANPR) to track buses entering and exiting a gate.

## Features
- **Automatic Plate Scanning:** Automatically scans and detects bus plates using the device camera.
- **Real-time Dashboard:** Live updates via Socket.io for administrators.
- **Smart Cooldown:** Prevents duplicate entries within a 60-second window.
- **Modern UI:** Responsive, clean interface for both capture and administration.

## Prerequisites
- Node.js (v14+ recommended)
- MongoDB account (or local instance)

## Setup Instructions

### 1. Backend Setup
1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
4. Update the `.env` file with your details:
   - `MONGO_URI`: Your MongoDB connection string.
   - `JWT_SECRET`: A secure random string for tokens.
   - `ADMIN_EMAIL`: The email address for the admin account (e.g., admin@example.com).
   - `ADMIN_PASSWORD`: The password for the admin account.

5. Start the server:
   ```bash
   npm run dev
   ```

### 2. Frontend Setup
1. Navigate to the `client` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the React app:
   ```bash
   npm start
   ```

## Usage
- Open `http://localhost:3000` to access the scanning page. Grant camera permissions. The app will automatically scan for plates every 2 seconds.
- Navigate to `http://localhost:3000/login` to log in using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you configured in the `.env` file.
- Access the dashboard at `http://localhost:3000/admin` to view real-time statistics and entries.
