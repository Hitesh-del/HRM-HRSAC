# Requirements Document

## 1. Application Overview

**Application Name**: 3-Tier Human Resource Management System

**Description**: An enterprise-level HRM system supporting three user roles (Director, Management, Employee) with comprehensive modules including authentication with device security verification, attendance, leave management, payroll, recruitment, performance tracking, training, asset management, reporting capabilities, and real-time notification system. The system features a modern dark theme design, role-based access control, and full responsive design across all devices.

## 2. Users and Usage Scenarios

**Target Users**:
- Director: Full system access, company setup, account creation authority
- Management: Department-level access, team management capabilities
- Employee: Personal data access, self-service functions

**Core Usage Scenarios**:
- Company initialization and organizational setup
- Secure login with device verification
- Password reset via email for all user types
- Daily attendance tracking and leave management
- Payroll processing and salary distribution
- Recruitment workflow and candidate management
- Performance evaluation and training coordination
- Asset allocation and tracking
- Real-time monitoring and reporting
- Real-time notification delivery and management
- Responsive access across desktop, tablet, and mobile devices

## 3. Page Structure and Functionality

### 3.1 Page Hierarchy

```
HRM System
├── Authentication
│   ├── First-Time Setup (Director Only)
│   ├── Login Page with Device Verification
│   ├── Forgot Password Page
│   ├── Reset Password Page
│   └── Password Management
├── Director Panel
│   ├── Header with Notification System
│   ├── Dashboard
│   ├── Company Overview
│   ├── Employee Management
│   ├── Department Management
│   ├── Management Accounts
│   ├── Attendance Monitoring
│   ├── Leave Monitoring
│   ├── Leave Type Management
│   ├── Payroll Management
│   ├── Recruitment
│   ├── Project Management
│   ├── Asset Management
│   ├── Performance Management
│   ├── Training Management
│   ├── Internship Management
│   ├── Company Announcements
│   ├── Reports & Analytics
│   ├── Activity Logs
│   ├── Security Logs
│   ├── Notification History
│   └── Settings
├── Management Panel
│   ├── Header with Notification System
│   ├── Dashboard
│   ├── Team Management
│   ├── Employee Directory
│   ├── Attendance Management
│   ├── Leave Management
│   ├── Shift Management
│   ├── Task Management
│   ├── Project Management
│   ├── Performance Tracking
│   ├── Recruitment
│   ├── Training
│   ├── Internship Management
│   ├── Asset Tracking
│   ├── Announcements
│   ├── Reports
│   ├── Notification History
│   └── Settings (with Security Tab)
└── Employee Panel
    ├── Header with Notification System
    ├── Dashboard
    ├── My Profile
    ├── Attendance
    ├── Leave Requests
    ├── Salary & Payslips
    ├── Tasks
    ├── My Projects
    ├── Performance
    ├── Training
    ├── Career Opportunities
    ├── Company Announcements
    ├── Documents
    ├── Assigned Assets
    ├── Help & Support
    ├── Notification History
    └── Settings (with Security Tab)
```

### 3.2 Authentication Module

#### 3.2.1 First-Time Setup Page
- Display company registration form with fields: Company Name, Company Logo upload, Director Name, Mobile Number, Email, Password
- Submit registration to create Director account and initialize organization
- After successful setup, disable signup functionality permanently
- Fully responsive across all device sizes

#### 3.2.2 Login Page with Device Verification
- Display Company Logo and Company Name at the top
- Display three role selection buttons/cards: Login as Director (with Shield icon), Login as Management (with Users icon), Login as Employee (with User icon)
- When user clicks a role card, highlight the selected role and display login form below
- Login form input fields: Mobile Number/Email, Password
- Remember Me checkbox
- Forgot Password link
- Login button
- After user submits login credentials:
  + Generate device fingerprint combining userAgent, screen resolution, platform, timezone, language
  + Store device_id in localStorage
  + Validate credentials and role match
  + Check trusted_devices table for matching device_id + user_id
  + If trusted device → redirect to role-specific dashboard
  + If new device → reveal inline OTP verification section below login button without redirect
- If role mismatch occurs, display error message: You are not authorized as [selected role]
- If intern account is disabled, display error message: Your internship account has been disabled. Please contact the administrator.
- Apply premium dark theme design with Electric Cyan (#00E5FF) accents
- Fully responsive: role cards stack vertically on mobile, form fields adapt width, buttons remain accessible

##### 3.2.2.1 Inline OTP Verification Section
- Display when new device detected after successful credential validation
- Show inline section below login button containing:
  + Heading: Security Verification Required
  + Message: We detected a login from a new device. Enter the verification code sent to your registered email.
  + 6-digit OTP input field
  + Verify & Login button
  + Resend Code button (disabled for 30 seconds with countdown timer)
- When user clicks Verify & Login button:
  + Validate OTP against device_otp_verifications table
  + If valid → insert device into trusted_devices table, redirect to dashboard
  + If invalid → display error message, increment attempts counter
  + If max 5 attempts reached → invalidate OTP, display error: Maximum attempts exceeded. Please resend code.
- When user clicks Resend Code button:
  + Invalidate previous OTP
  + Generate new 6-digit OTP
  + Send via email using Edge Function
  + Store in device_otp_verifications table with 10-minute expiry
  + Disable Resend button for 30 seconds with countdown
- OTP expires in 10 minutes
- After 5 failed attempts, OTP is invalidated and user must resend
- Fully responsive: OTP input adapts to screen width, buttons stack on small screens

#### 3.2.3 Forgot Password Page
- Display when user clicks Forgot Password link on Login page
- Display heading: Reset Your Password
- Display Email input field with placeholder: Enter your registered email address
- Display Send Reset Link button
- When user enters email and clicks Send Reset Link button:
  + Validate email format
  + Check if email exists in HRM system (users table)
  + If email not found → display error message: Account not found with this email address. Do NOT send email.
  + If email exists → generate unique secure password reset token, store in password_resets table with user_id, token_hash, expires_at (30 minutes from creation), created_at
  + Send password reset email containing secure reset link: https://hrm-system.com/reset-password?token=[unique_token]
  + Display success message: Password reset link has been sent to your email address. Please check your inbox.
- Display Back to Login link
- Fully responsive: form fields and buttons adapt to all screen sizes

#### 3.2.4 Reset Password Page
- Display when user clicks password reset link from email
- Extract token from URL query parameter
- Validate token:
  + Check if token exists in password_resets table
  + Check if token is not expired (expires_at > current time)
  + Check if token is not already used (is_used = false)
  + If token invalid or expired → display error message: Reset link has expired. Please request a new password reset link. Display Request New Link button.
  + If token valid → display reset password form
- Reset password form contains:
  + Heading: Create New Password
  + New Password input field (password type)
  + Confirm New Password input field (password type)
  + Update Password button
- When user enters passwords and clicks Update Password button:
  + Validate New Password and Confirm New Password match
  + Validate password meets security requirements (minimum 8 characters)
  + If validation fails → display error message
  + If validation passes → hash new password, update user password in users table, mark token as used (set is_used = true in password_resets table), display success message: Password updated successfully. You can now login with your new password.
  + Redirect to Login page after 3 seconds
- Display Back to Login link
- Fully responsive: form fields stack vertically on mobile, buttons remain accessible

#### 3.2.5 Password Management
- Change Password: Allow users to update current password
- Account Security Settings: Manage security preferences

### 3.3 Global Notification System (All Panels)

#### 3.3.1 Header Notification Component
- Display bell icon in header navigation bar
- Display unread notification count badge on bell icon
- When user clicks bell icon, display notification dropdown panel
- Dropdown panel displays recent notifications (latest 10)
- Each notification item shows: notification icon, notification message, timestamp, read/unread status
- Clicking notification item marks as read and navigates to relevant page
- Dropdown panel includes View All Notifications link to Notification History page
- Fully responsive: dropdown adapts width on mobile, notification items wrap text properly

#### 3.3.2 Notification History Page
- Display all notifications in chronological order (newest first)
- Display notification list table with columns: Notification Icon, Message, Category, Timestamp, Status, Actions
- Category values: Announcement, Leave, Recruitment, Training, Asset, Project, Internship, System, Security
- Status values: Read, Unread
- Actions column includes: Mark as Read button, Delete button
- Table features: Filter by category dropdown, Filter by status dropdown, Search by message, Sort by timestamp, Pagination
- Display Mark All as Read button at top
- Clicking notification message navigates to relevant page
- Fully responsive: table becomes scrollable horizontally on mobile, filters stack vertically

#### 3.3.3 Real-Time Notification Delivery
- All notifications delivered in real-time without page refresh
- Unread count badge updates immediately when new notification arrives
- Notification dropdown updates immediately when new notification arrives
- Notification History page updates immediately when new notification arrives

### 3.4 Director Panel

#### 3.4.1 Dashboard
- Display widgets: Total Employees, Total Management Members, Active Employees, Departments, Attendance Summary, Employees on Leave, Monthly Payroll Summary, New Joiners, Pending Approvals, Performance Metrics, Company Growth Metrics, Total Open Positions, Active Candidates, Interviews Scheduled, Pending Offers
- Show real-time data updates
- Fully responsive: widgets stack vertically on mobile, adapt to 2-column on tablet, 3-4 column on desktop

#### 3.4.2 Company Overview
- Display and edit company profile information
- Manage company logo
- View organizational structure
- Fully responsive: forms and content adapt to screen width

#### 3.4.3 Employee Management
- Display Create Employee button
- Display Employee List table with columns: Employee ID, Name, Mobile Number, Email, Department, Designation, Role, Status, Actions
- Create Employee form with fields: Name, Mobile Number, Email, Department, Designation, Role
- After submitting Create Employee form, immediately add new employee record to Employee List table without page refresh
- Table features: Search by name/email/employee ID, Filter by department/role/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button, Edit button, Delete button
- Edit employee information inline or via modal
- Deactivate/activate employee accounts via status toggle
- Fully responsive: table scrolls horizontally on mobile, form fields stack vertically, buttons remain accessible

##### 3.4.3.1 Advanced Download Popup for Employee Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Popup contains:
  - Download Range dropdown with options: Last 30 Days, Last 3 Months, Last 6 Months, Last 1 Year, Custom Date Range
  - If Custom Date Range selected, display From Date picker and To Date picker
  - Generate PDF button
  - Generate CSV button
  - Cancel button
- After user selects date range and clicks Generate PDF or Generate CSV, system filters employee records by Joining Date within selected period and exports only matching records
- Fully responsive: popup adapts to screen size, buttons stack on mobile

##### 3.4.3.2 PDF Export Format for Employee Management
- PDF contains only:
  - Company Name at top
  - Report Title: Employee Management Report
  - Generated Date: [current date]
  - Employee Table with columns: Employee ID, Name, Department, Designation, Email, Mobile, Joining Date, Status
- PDF excludes: sidebar, header, navigation, buttons, filters, search bar

##### 3.4.3.3 Print Layout for Employee Management
- Print output contains only:
  - Company Name
  - Report Title: Employee Management Report
  - Generated Date
  - Employee Table with columns: Employee ID, Name, Department, Designation, Email, Mobile, Joining Date, Status
- Print excludes: sidebar, header, navigation, buttons, filters, search bar

#### 3.4.4 Department Management
- Display Create Department button
- Display Department List table with columns: Department ID, Department Name, Department Head, Total Employees, Status, Actions
- Create Department form with fields: Department Name, Department Head selection
- After submitting Create Department form, immediately add new department record to Department List table without page refresh
- Table features: Search by department name, Filter by status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button, Edit button, Delete button
- Edit department information inline or via modal
- Fully responsive: table and forms adapt to all screen sizes

##### 3.4.4.1 Advanced Download Popup for Department Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup with same structure as Employee Management
- Filter department records by creation date within selected period

##### 3.4.4.2 PDF Export Format for Department Management
- PDF contains: Company Name, Report Title: Department Management Report, Generated Date, Department Table with columns: Department ID, Department Name, Department Head, Total Employees, Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.4.3 Print Layout for Department Management
- Print contains: Company Name, Report Title, Generated Date, Department Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.5 Management Accounts
- Display Create Management Account button
- Display Management Accounts List table with columns: Management ID, Name, Mobile Number, Email, Assigned Department, Status, Actions
- Create Management Account form with fields: Name, Mobile Number, Email, Assigned Department, Permissions
- After submitting Create Management Account form, immediately add new management account record to Management Accounts List table without page refresh
- Table features: Search by name/email, Filter by department/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button, Edit button, Delete button
- Edit management account information and permissions
- Fully responsive: table and forms adapt to all screen sizes

##### 3.4.5.1 Advanced Download Popup for Management Accounts
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter management account records by creation date within selected period

##### 3.4.5.2 PDF Export Format for Management Accounts
- PDF contains: Company Name, Report Title: Management Accounts Report, Generated Date, Management Accounts Table with columns: Management ID, Name, Mobile Number, Email, Assigned Department, Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.5.3 Print Layout for Management Accounts
- Print contains: Company Name, Report Title, Generated Date, Management Accounts Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.6 Attendance Monitoring
- Display Attendance Records table with columns: Employee ID, Employee Name, Department, Check-In Time, Check-Out Time, Working Hours, Attendance Status
- Display real-time attendance data for all employees
- Attendance Status values: Present, Absent, Late, On Leave, Half Day
- Table features: Search by employee name/ID, Filter by department/date/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display date selector to view attendance for specific date
- Automatically update table when new check-in/check-out events occur
- Fully responsive: table scrolls horizontally on mobile, filters stack vertically

##### 3.4.6.1 Advanced Download Popup for Attendance Monitoring
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter attendance records by date within selected period

##### 3.4.6.2 PDF Export Format for Attendance Monitoring
- PDF contains: Company Name, Report Title: Attendance Monitoring Report, Generated Date, Attendance Table with columns: Employee ID, Employee Name, Department, Check-In Time, Check-Out Time, Working Hours, Attendance Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.6.3 Print Layout for Attendance Monitoring
- Print contains: Company Name, Report Title, Generated Date, Attendance Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.7 Leave Monitoring
- Display Leave Requests table with columns: Employee Name, Department, Leave Type, Start Date, End Date, Reason, Request Status, Manager Comments, Approval Actions
- Display leave requests requiring Director final approval (manager-approved requests) and all approved/rejected requests
- Request Status values: Under Manager Review, Manager Approved, Director Review, Approved, Rejected
- Approval Actions column includes: Approve button (for Manager Approved requests requiring Director approval), Reject button (for Manager Approved requests requiring Director approval), View Details button
- After clicking Approve or Reject button, immediately update Request Status in table without page refresh
- Table features: Search by employee name, Filter by department/leave type/status/date range, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display Department Leave Summary statistics
- Display Leave Analytics charts
- Configure leave approval policy: Manager approval only OR Director final approval required
- Automatically update table when new leave requests are submitted or manager approves requests
- Fully responsive: table scrolls horizontally on mobile, filters and buttons stack vertically

##### 3.4.7.1 Advanced Download Popup for Leave Monitoring
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter leave records by Start Date within selected period

##### 3.4.7.2 PDF Export Format for Leave Monitoring
- PDF contains: Company Name, Report Title: Leave Monitoring Report, Generated Date, Leave Requests Table with columns: Employee Name, Department, Leave Type, Start Date, End Date, Reason, Request Status, Manager Comments
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.7.3 Print Layout for Leave Monitoring
- Print contains: Company Name, Report Title, Generated Date, Leave Requests Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.8 Leave Type Management
- Display Create Leave Type button
- Display Leave Types List table with columns: Leave Type ID, Leave Type Name, Description, Status, Actions
- Create Leave Type form with fields: Leave Type Name, Description
- After submitting Create Leave Type form, immediately add new leave type record to Leave Types List table without page refresh
- Table features: Search by leave type name, Filter by status, Sort by any column, Pagination, Real-Time Refresh button
- Actions column includes: Edit button, Delete button
- Edit leave type information inline or via modal
- Delete leave type (only if not currently used in any leave requests)
- All leave types are stored in database leave_types table
- When Director creates/edits/deletes leave type, changes immediately sync to Employee Panel leave request dropdown
- Fully responsive: table and forms adapt to all screen sizes

#### 3.4.9 Payroll Management

##### 3.4.9.1 Salary Structure Management
- Display Create Salary Structure button
- Display Salary Structures List table with columns: Employee ID, Employee Name, Department, Basic Salary, HRA, Travel Allowance, Medical Allowance, Special Allowance, PF, ESI, Tax, Other Deductions, Actions
- Create Salary Structure form with fields: Employee selection dropdown, Basic Salary, HRA, Travel Allowance, Medical Allowance, Special Allowance, PF, ESI, Tax, Other Deductions
- After submitting Create Salary Structure form, immediately add new salary structure record to Salary Structures List table without page refresh
- Table features: Search by employee name/ID, Filter by department, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: Edit button, Delete button
- Edit salary structure inline or via modal
- Fully responsive: table scrolls horizontally on mobile, forms stack vertically

##### 3.4.9.2 Advanced Download Popup for Payroll Management
- When user clicks Export to PDF or Export to Excel button in Salary Structures or Payroll Records, display Generate Report popup
- Filter records by creation date or payroll month within selected period

##### 3.4.9.3 PDF Export Format for Payroll Management
- PDF contains: Company Name, Report Title: Payroll Management Report, Generated Date, Payroll Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.9.4 Print Layout for Payroll Management
- Print contains: Company Name, Report Title, Generated Date, Payroll Table
- Print excludes: sidebar, header, navigation, buttons, filters

##### 3.4.9.5 Run Payroll Engine
- Display Run Payroll section with Month/Year selector
- Display Run Payroll button
- When Director clicks Run Payroll button:
  - Step 1: Validate all active employees have salary structures assigned, display validation error if missing: Salary Structure Not Assigned for [Employee Names]
  - Step 2: Fetch attendance records for selected month (working days, present days, absent days, late marks, overtime hours)
  - Step 3: Fetch leave records for selected month (paid leave, unpaid leave)
  - Step 4: Calculate net salary per employee using formula: Net Salary = (Basic Salary + HRA + Travel Allowance + Medical Allowance + Special Allowance + Bonus + Overtime Amount) - (PF + ESI + Tax + Other Deductions + Unpaid Leave Deductions)
  - Step 5: Generate payroll records in database
  - Step 6: Update Payroll Dashboard statistics in real-time
  - Step 7: Generate payslips for all employees
  - Step 8: Send payroll notifications to employees
- Display success message after payroll generation completes
- Fully responsive: selectors and buttons adapt to screen width

##### 3.4.9.6 Payroll Dashboard Cards
- Display Total Payroll card showing sum of all net salaries for selected month
- Display Paid card showing count of employees with paid status
- Display Pending Payment card showing count of employees not yet paid
- Cards update in real-time after Run Payroll completes
- Fully responsive: cards stack vertically on mobile, 2-column on tablet, 3-column on desktop

##### 3.4.9.7 Payroll Records Table
- Display Payroll Records table with columns: Employee ID, Employee Name, Department, Basic Salary, HRA, Allowances, Bonus, Deductions, Net Salary, Payroll Month, Payroll Year, Status, Actions
- Status values: Paid, Pending Payment
- Actions column includes: Mark as Paid button, View Payslip button
- After clicking Mark as Paid button, immediately update Status to Paid without page refresh
- Table features: Search by employee name/ID, Filter by department/status/month/year, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display empty state message when no payroll generated: No payroll has been generated for the selected month.
- Fully responsive: table scrolls horizontally on mobile

##### 3.4.9.8 Payslip Generation
- Generate payslip PDF for each employee after payroll run
- Payslip includes: Employee details, Salary breakdown, Deductions breakdown, Net salary, Payroll month/year
- Director can view and download payslips from Payroll Records table

#### 3.4.10 Recruitment

##### 3.4.10.1 Recruitment Dashboard
- Display Total Open Positions card showing count of active job openings
- Display Active Candidates card showing count of candidates in pipeline
- Display Interviews Scheduled card showing count of upcoming interviews
- Display Pending Offers card showing count of offers awaiting acceptance
- Cards update in real-time when recruitment actions occur
- Fully responsive: cards stack vertically on mobile

##### 3.4.10.2 Job Openings Management
- Display Create Job Opening button
- Display Job Openings List table with columns: Position ID, Position Title, Department, Required Skills, Experience, Application Deadline, Status, Actions
- Create Job Opening form with fields: Position Title, Department selection dropdown, Job Description, Required Skills, Experience, Application Deadline
- After submitting Create Job Opening form, immediately add new job opening record to Job Openings List table without page refresh
- Notify relevant department manager and all employees when new job opening created
- Status values: Open, Closed
- Actions column includes: View Details button, Edit button, Close Opening button
- Table features: Search by position title, Filter by department/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Fully responsive: table and forms adapt to all screen sizes

##### 3.4.10.3 Advanced Download Popup for Recruitment
- When user clicks Export to PDF or Export to Excel button in Job Openings or Applicants, display Generate Report popup
- Filter records by creation date or application date within selected period

##### 3.4.10.4 PDF Export Format for Recruitment
- PDF contains: Company Name, Report Title: Recruitment Report, Generated Date, Recruitment Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.10.5 Print Layout for Recruitment
- Print contains: Company Name, Report Title, Generated Date, Recruitment Table
- Print excludes: sidebar, header, navigation, buttons, filters

##### 3.4.10.6 Applicants Management
- Display Applicants List table with columns: Applicant ID, Applicant Name, Position Applied, Department, Application Date, Status, Interview Date, Actions
- View all applicants company-wide
- Status values: Submitted, Under Review, Interview Scheduled, Offer Extended, Hired, Rejected
- Actions column includes: View Application button, Schedule Interview button, Approve Hiring button, Reject button, Generate Offer Letter button
- Table features: Search by applicant name, Filter by position/department/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Schedule interview by selecting date/time and assigning interviewer
- Approve hiring decision triggers employee account creation flow
- Generate offer letter for selected candidate
- Fully responsive: table scrolls horizontally on mobile

##### 3.4.10.7 Recruitment Reports
- Generate company-wide recruitment reports
- View recruitment analytics and metrics
- Export reports to PDF/Excel

#### 3.4.11 Project Management
- Display Create Project button
- Create Project form with fields: Project Name, Description, Department selection dropdown, Employee assignment multi-select dropdown, Intern assignment multi-select dropdown, Start Date, End Date, Priority dropdown
- Priority dropdown options: Low, Medium, High, Critical
- When Department is selected in form, Employee assignment dropdown and Intern assignment dropdown dynamically filter to show ONLY employees and interns from selected department
- When Department selection changes, Employee assignment dropdown and Intern assignment dropdown update immediately to reflect new department's employees and interns
- Display Projects List table with columns: Project ID, Project Name, Department, Assigned Employees, Assigned Interns, Start Date, End Date, Priority, Status, Actions
- After submitting Create Project form, immediately add new project record to Projects List table without page refresh
- After submitting Create Project form, project immediately appears in Management Panel Project Management, Employee Panel My Projects (for assigned employees), and Intern Panel My Projects (for assigned interns) without page refresh
- Table features: Search by project name, Filter by department/priority/status/date, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button, Edit button, Delete button
- Monitor project progress and timelines
- Projects table includes priority column storing values: Low, Medium, High, Critical
- Fully responsive: table and forms adapt to all screen sizes, dropdowns remain usable

##### 3.4.11.1 Advanced Download Popup for Project Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter project records by Start Date within selected period

##### 3.4.11.2 PDF Export Format for Project Management
- PDF contains: Company Name, Report Title: Project Management Report, Generated Date, Projects Table with columns: Project ID, Project Name, Department, Assigned Employees, Assigned Interns, Start Date, End Date, Priority, Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.11.3 Print Layout for Project Management
- Print contains: Company Name, Report Title, Generated Date, Projects Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.12 Asset Management
- Display Register Asset button
- Register Asset form with fields: Asset Name, Category, Serial Number, Purchase Date, Asset Status
- Display Assets List table with columns: Asset ID, Asset Name, Category, Serial Number, Assigned To, Assigned Date, Asset Status, Actions
- After registering asset, immediately add new asset record to Assets List table without page refresh
- Assign asset to employee by selecting employee from dropdown and setting assignment date
- After assigning asset to employee, asset immediately appears in Employee Panel Assigned Assets tab and Management Panel Asset Tracking section without page refresh
- Asset Status values: Available, Assigned, Under Maintenance, Retired
- Table features: Search by asset name/serial number, Filter by category/status/assigned employee, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Real-Time Refresh button
- Actions column includes: View Details button, Edit button, Assign to Employee button, Record Return button, Delete button
- Record asset returns when employee leaves or asset is reassigned
- Generate asset reports
- Fully responsive: table and forms adapt to all screen sizes

#### 3.4.13 Performance Management
- Define KPIs for employees
- Conduct employee reviews
- Set and track goals
- Assign performance ratings
- Generate performance reports
- Table features: Export to Excel button, Export to PDF button, Print button
- Fully responsive: forms and tables adapt to all screen sizes

##### 3.4.13.1 Advanced Download Popup for Performance Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter performance records by review date within selected period

##### 3.4.13.2 PDF Export Format for Performance Management
- PDF contains: Company Name, Report Title: Performance Management Report, Generated Date, Performance Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.13.3 Print Layout for Performance Management
- Print contains: Company Name, Report Title, Generated Date, Performance Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.14 Training Management
- Display Create Training Program button
- Create Training Program form with fields: Training Name, Description, Training Date, Department assignment dropdown, Status
- After submitting Create Training Program form, immediately add new training record to Training Programs List table without page refresh
- Training program automatically appears in Management Panel Training tab and Employee Panel Training tab for users in assigned department without page refresh
- Display Training Programs List table with columns: Training ID, Training Name, Description, Training Date, Department, Status, Completion Progress, Actions
- Table features: Search by training name, Filter by department/status/date, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button, Edit button, Delete button, Assign Employees button
- Assign training courses to employees within department
- Track training progress and completion status
- Manage certifications
- Generate training reports
- Department-based filtering: only Management and Employees in assigned department can view the training
- Fully responsive: table and forms adapt to all screen sizes

##### 3.4.14.1 Advanced Download Popup for Training Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter training records by Training Date within selected period

##### 3.4.14.2 PDF Export Format for Training Management
- PDF contains: Company Name, Report Title: Training Management Report, Generated Date, Training Programs Table with columns: Training ID, Training Name, Description, Training Date, Department, Status, Completion Progress
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.14.3 Print Layout for Training Management
- Print contains: Company Name, Report Title, Generated Date, Training Programs Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.15 Internship Management

##### 3.4.15.1 Intern List
- Display Intern List table with columns: Intern ID, Intern Name, Department, Mobile Number, Email, Internship Start Date, Internship End Date, Account Status, Actions
- Account Status values: Active, Disabled
- Actions column includes: View Details button, Edit button, Enable button (for Disabled interns), Disable button (for Active interns)
- When Director clicks Disable button, intern account status immediately changes to Disabled without page refresh
- When intern account is disabled, intern cannot login and sees error message: Your internship account has been disabled. Please contact the administrator.
- When Director clicks Enable button, intern account status immediately changes to Active without page refresh
- When intern account is enabled, intern can login immediately
- Table features: Search by intern name/ID, Filter by department/account status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

##### 3.4.15.2 Intern Attendance Tab
- Display Intern Attendance table with columns: Intern ID, Intern Name, Department, Date, Check-In Time, Check-Out Time, Working Hours, Attendance Status
- Display real-time attendance data for all interns fetched from database
- Attendance Status values: Present, Absent, Late, On Leave, Half Day
- Table features: Search by intern name/ID, Filter by department/date/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display date selector to view attendance for specific date
- Automatically update table when new check-in/check-out events occur
- Fully responsive: table scrolls horizontally on mobile

##### 3.4.15.3 Advanced Download Popup for Intern Attendance
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter intern attendance records by date within selected period

##### 3.4.15.4 PDF Export Format for Intern Attendance
- PDF contains: Company Name, Report Title: Intern Attendance Report, Generated Date, Intern Attendance Table with columns: Intern ID, Intern Name, Department, Date, Check-In Time, Check-Out Time, Working Hours, Attendance Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.4.15.5 Print Layout for Intern Attendance
- Print contains: Company Name, Report Title, Generated Date, Intern Attendance Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.4.16 Company Announcements
- Create and publish announcements
- Target specific departments or all employees
- Schedule announcement delivery
- View announcement history
- Fully responsive: forms and content adapt to all screen sizes

#### 3.4.17 Reports & Analytics
- Generate comprehensive reports for: Employees, Attendance, Leave, Payroll, Recruitment, Performance, Training, Assets, Department Performance, Organization Growth
- Export reports to PDF/Excel
- Print reports
- Fully responsive: report views and export options adapt to all screen sizes

#### 3.4.18 Activity Logs
- View system-wide activity logs
- Track user actions and changes
- Filter logs by date, user, or action type
- Fully responsive: log tables scroll horizontally on mobile

#### 3.4.19 Security Logs
- Display Security Logs table with columns: User Name, Role, Device Name, Browser, Login Date & Time, IP Address, Verification Status, Event Type, Actions
- Verification Status values: Direct (Trusted Device), OTP Verified, Failed
- Event Type values: New Device Login, OTP Verification Success, OTP Verification Failed, Device Removed, Multiple Failed Attempts
- Track new device login attempts
- Track OTP verification success and failures
- Track device removals
- Track failed OTP attempts (3+ failures)
- Table features: Search by user name, Filter by role/verification status/event type/date range, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button
- Fully responsive: table scrolls horizontally on mobile

#### 3.4.20 Notification History
- Display all notifications in chronological order
- Filter by category: Announcement, Leave, Recruitment, Training, Asset, Project, Internship, System, Security
- Filter by status: Read, Unread
- Mark as read or delete notifications
- Navigate to relevant pages by clicking notification message
- Fully responsive: notification list and filters adapt to all screen sizes

#### 3.4.21 Settings
- Manage company profile and logo
- Configure departments and designations
- Define roles and permissions
- Adjust notification settings
- Configure security settings
- Manage account settings
- Fully responsive: settings forms and options adapt to all screen sizes

### 3.5 Management Panel

#### 3.5.1 Dashboard
- Display widgets: Team Attendance, Leave Requests, Pending Tasks, Active Projects, Team Performance, New Requests, Productivity Metrics, Department Statistics, Department Vacancies, Interviews Today, Candidate Pipeline, Pending Leave Requests, Approved Leaves, Rejected Leaves
- Show department-specific data
- Fully responsive: widgets stack vertically on mobile, adapt to 2-column on tablet

#### 3.5.2 Team Management
- View team members within assigned department
- Monitor team activities
- Assign tasks to team members
- Table features: Export to Excel button, Export to PDF button, Print button
- Fully responsive: tables and forms adapt to all screen sizes

##### 3.5.2.1 Advanced Download Popup for Team Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter team member records by joining date within selected period

##### 3.5.2.2 PDF Export Format for Team Management
- PDF contains: Company Name, Report Title: Team Management Report, Generated Date, Team Members Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.2.3 Print Layout for Team Management
- Print contains: Company Name, Report Title, Generated Date, Team Members Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.5.3 Employee Directory
- View employee list within department
- Search and filter employees
- Access employee contact information
- Fully responsive: directory lists and search adapt to all screen sizes

#### 3.5.4 Attendance Management

##### 3.5.4.1 Employee Attendance Section
- Display Employee Attendance table with columns: Employee ID, Employee Name, Department, Check-In Time, Check-Out Time, Working Hours, Attendance Status, Date
- Show only attendance records for employees in assigned department
- Attendance Status values: Present, Absent, Late, On Leave, Half Day
- Table features: Search by employee name/ID, Filter by date/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display date selector to view attendance for specific date
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.4.2 Intern Attendance Section
- Display Intern Attendance table with columns: Intern ID, Intern Name, Department, Check-In Time, Check-Out Time, Working Hours, Attendance Status, Date
- Show only attendance records for interns in assigned department
- Attendance Status values: Present, Absent, Late, On Leave, Half Day
- Table features: Search by intern name/ID, Filter by date/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display date selector to view attendance for specific date
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.4.3 Advanced Download Popup for Attendance Management
- When user clicks Export to PDF or Export to Excel button in Employee Attendance or Intern Attendance, display Generate Report popup
- Filter attendance records by date within selected period

##### 3.5.4.4 PDF Export Format for Attendance Management
- PDF contains: Company Name, Report Title: Attendance Management Report (Employee/Intern), Generated Date, Attendance Table with columns: ID, Name, Department, Check-In Time, Check-Out Time, Working Hours, Attendance Status, Date
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.4.5 Print Layout for Attendance Management
- Print contains: Company Name, Report Title, Generated Date, Attendance Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.5.5 Leave Management

##### 3.5.5.1 Pending Leave Requests Section
- Display Pending Leave Requests table with columns: Employee Name, Leave Type, Start Date, End Date, Reason, Leave Balance, Request Status, Actions
- Show only leave requests from department employees with status Under Manager Review
- Actions column includes: View Details button, Approve button, Reject button, Add Comments field
- After clicking Approve button, immediately update Request Status to Manager Approved and route to Director (if final approval required) or auto-approve without page refresh
- After clicking Reject button, immediately update Request Status to Rejected without page refresh
- Display employee leave balance when viewing request details
- Table features: Search by employee name, Filter by leave type/date range, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Automatically update table when new leave requests submitted by department employees
- Fully responsive: table scrolls horizontally on mobile, action buttons remain accessible

##### 3.5.5.2 Advanced Download Popup for Leave Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter leave records by Start Date within selected period

##### 3.5.5.3 PDF Export Format for Leave Management
- PDF contains: Company Name, Report Title: Leave Management Report, Generated Date, Leave Requests Table with columns: Employee Name, Leave Type, Start Date, End Date, Reason, Request Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.5.4 Print Layout for Leave Management
- Print contains: Company Name, Report Title, Generated Date, Leave Requests Table
- Print excludes: sidebar, header, navigation, buttons, filters

##### 3.5.5.5 Leave History
- View team leave calendar
- Monitor leave balances for department employees
- View approved and rejected leave history
- Fully responsive: calendar and history views adapt to all screen sizes

##### 3.5.5.6 Payroll Reports
- View department-level payroll reports
- Access payroll summaries for department employees
- Export payroll data to PDF/Excel
- Fully responsive: reports adapt to all screen sizes

#### 3.5.6 Shift Management
- Define shift schedules for team
- Assign shifts to employees
- Manage shift rotations
- Fully responsive: shift schedules and forms adapt to all screen sizes

#### 3.5.7 Task Management
- Create and assign tasks to team members
- Monitor task progress
- Set task deadlines and priorities
- Track task completion
- Fully responsive: task lists and forms adapt to all screen sizes

#### 3.5.8 Project Management
- Display Projects List table with columns: Project ID, Project Name, Department, Assigned Employees, Assigned Interns, Start Date, End Date, Priority, Status, Progress Percentage, Actions
- View department projects only
- Projects created by Director automatically appear in this section without page refresh
- Assign team members to projects
- Monitor project milestones
- Track project deliverables
- Table features: Search by project name, Filter by priority/status/date, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Actions column includes: View Details button, Update Progress button
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.8.1 Advanced Download Popup for Project Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter project records by Start Date within selected period

##### 3.5.8.2 PDF Export Format for Project Management
- PDF contains: Company Name, Report Title: Project Management Report, Generated Date, Projects Table with columns: Project ID, Project Name, Department, Assigned Employees, Assigned Interns, Start Date, End Date, Priority, Status, Progress Percentage
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.8.3 Print Layout for Project Management
- Print contains: Company Name, Report Title, Generated Date, Projects Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.5.9 Performance Tracking
- Conduct team performance reviews
- Track individual KPIs
- Provide performance feedback
- Generate team performance reports
- Fully responsive: performance forms and reports adapt to all screen sizes

#### 3.5.10 Recruitment

##### 3.5.10.1 Department Job Openings
- Display Job Openings List table with columns: Position ID, Position Title, Job Description, Required Skills, Experience, Application Deadline, Status
- View only job openings for assigned department
- Table features: Search by position title, Filter by status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Receive notification when new job opening created for department
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.10.2 Advanced Download Popup for Recruitment
- When user clicks Export to PDF or Export to Excel button in Job Openings or Candidates, display Generate Report popup
- Filter records by creation date or application date within selected period

##### 3.5.10.3 PDF Export Format for Recruitment
- PDF contains: Company Name, Report Title: Recruitment Report, Generated Date, Recruitment Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.10.4 Print Layout for Recruitment
- Print contains: Company Name, Report Title, Generated Date, Recruitment Table
- Print excludes: sidebar, header, navigation, buttons, filters

##### 3.5.10.5 Department Candidates
- Display Candidates List table with columns: Applicant ID, Applicant Name, Position Applied, Application Date, Status, Interview Date, Actions
- View only candidates applying for department positions
- Status values: Submitted, Under Review, Interview Scheduled, Offer Extended, Hired, Rejected
- Actions column includes: View Application button, Add Interview Feedback button, Submit Hiring Recommendation button
- Table features: Search by applicant name, Filter by position/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Add interview feedback after conducting interviews
- Submit hiring recommendation to Director for final approval
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.10.6 Interview Schedules
- View department interview schedules
- Manage interview appointments
- Receive notifications for upcoming interviews
- Fully responsive: schedules adapt to all screen sizes

#### 3.5.11 Training
- Display Training Programs List table with columns: Training Name, Description, Training Date, Department, Status, Completion Progress, Certificate Status
- View training programs assigned to department (department-based filtering)
- Training programs created by Director automatically appear in this tab without page refresh
- Assign training programs to team members within department
- Monitor training completion for team members
- Track skill development
- Table features: Search by training name, Filter by status/date, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.11.1 Advanced Download Popup for Training
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter training records by Training Date within selected period

##### 3.5.11.2 PDF Export Format for Training
- PDF contains: Company Name, Report Title: Training Report, Generated Date, Training Programs Table with columns: Training Name, Description, Training Date, Department, Status, Completion Progress
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.11.3 Print Layout for Training
- Print contains: Company Name, Report Title, Generated Date, Training Programs Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.5.12 Internship Management

##### 3.5.12.1 Intern List (Department-Scoped)
- Display Intern List table with columns: Intern ID, Intern Name, Department, Mobile Number, Email, Internship Start Date, Internship End Date, Account Status, Actions
- Show only interns in assigned department
- Account Status values: Active, Disabled
- Actions column includes: View Details button, Edit button, Enable button (for Disabled interns), Disable button (for Active interns)
- When Management clicks Disable button, intern account status immediately changes to Disabled without page refresh
- When intern account is disabled, intern cannot login and sees error message: Your internship account has been disabled. Please contact the administrator.
- When Management clicks Enable button, intern account status immediately changes to Active without page refresh
- When intern account is enabled, intern can login immediately
- Management cannot view or manage interns from other departments
- Table features: Search by intern name/ID, Filter by account status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.12.2 Intern Attendance List
- Display Intern Attendance table with columns: Intern ID, Intern Name, Department, Date, Check-In Time, Check-Out Time, Working Hours, Attendance Status
- Show only attendance records for interns in assigned department
- Attendance Status values: Present, Absent, Late, On Leave, Half Day
- Table features: Search by intern name/ID, Filter by date/status, Sort by any column, Pagination, Export to Excel button, Export to PDF button, Print button, Real-Time Refresh button
- Display date selector to view attendance for specific date
- Fully responsive: table scrolls horizontally on mobile

##### 3.5.12.3 Advanced Download Popup for Internship Management
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter intern attendance records by date within selected period

##### 3.5.12.4 PDF Export Format for Internship Management
- PDF contains: Company Name, Report Title: Internship Management Report, Generated Date, Intern Attendance Table with columns: Intern ID, Intern Name, Department, Date, Check-In Time, Check-Out Time, Working Hours, Attendance Status
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.12.5 Print Layout for Internship Management
- Print contains: Company Name, Report Title, Generated Date, Intern Attendance Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.5.13 Asset Tracking
- Display Assets List table with columns: Asset ID, Asset Name, Category, Serial Number, Assigned To, Assigned Date, Asset Status
- View assets assigned to employees in department
- Assets assigned by Director automatically appear in this section without page refresh
- Track asset status and location for department
- Table features: Search by asset name/serial number, Filter by category/status/assigned employee, Sort by any column, Pagination, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

#### 3.5.14 Announcements
- View company-wide announcements
- Create department-specific announcements
- Fully responsive: announcement lists and forms adapt to all screen sizes

#### 3.5.15 Reports
- Generate department-level reports for attendance, leave, performance, tasks, projects
- Export reports to PDF/Excel
- Table features: Export to Excel button, Export to PDF button, Print button
- Fully responsive: reports adapt to all screen sizes

##### 3.5.15.1 Advanced Download Popup for Reports
- When user clicks Export to PDF or Export to Excel button, display Generate Report popup
- Filter report data by date within selected period

##### 3.5.15.2 PDF Export Format for Reports
- PDF contains: Company Name, Report Title, Generated Date, Report Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters

##### 3.5.15.3 Print Layout for Reports
- Print contains: Company Name, Report Title, Generated Date, Report Table
- Print excludes: sidebar, header, navigation, buttons, filters

#### 3.5.16 Notification History
- Display all notifications in chronological order
- Filter by category: Announcement, Leave, Recruitment, Training, Asset, Project, Internship, System, Security
- Filter by status: Read, Unread
- Mark as read or delete notifications
- Navigate to relevant pages by clicking notification message
- Fully responsive: notification lists and filters adapt to all screen sizes

#### 3.5.17 Settings
- Manage personal account settings
- Configure notification preferences
- Security tab: View and manage trusted devices
- Fully responsive: settings forms adapt to all screen sizes

##### 3.5.17.1 Security Tab - Trusted Devices
- Display Trusted Devices List table with columns: Device Name, Browser, Last Login Date, Status, Actions
- Device Name parsed from userAgent
- Status values: Active, Removed
- Actions column includes: Remove Device button
- When user clicks Remove Device button, device status changes to Removed and device is removed from trusted_devices table
- Next login from removed device requires OTP verification
- Table features: Search by device name, Filter by status, Sort by last login date, Pagination
- Fully responsive: table scrolls horizontally on mobile

### 3.6 Employee Panel

#### 3.6.1 Dashboard
- Display widgets: Attendance Status, Monthly Attendance, Leave Balance, Upcoming Tasks, Assigned Projects, Latest Announcements, Performance Score, Salary Summary, Internal Job Opportunities, Recommended Positions, Request Status, Upcoming Approved Leaves
- Show personalized employee data
- Fully responsive: widgets stack vertically on mobile, adapt to 2-column on tablet

#### 3.6.2 My Profile
- View and edit personal information
- Update contact details
- Upload profile photo
- Fully responsive: profile forms and photo upload adapt to all screen sizes

#### 3.6.3 Attendance
- Check In button to record arrival time
- Check Out button to record departure time
- Display live working hours counter
- View attendance history
- Access monthly attendance reports
- Fully responsive: buttons and attendance history adapt to all screen sizes

#### 3.6.4 Leave Requests

##### 3.6.4.1 Submit Leave Request
- Display Submit Leave Request form with fields: Leave Type dropdown, Start Date, End Date, Reason
- Leave Type dropdown dynamically populated from database leave_types table
- Leave types created by Director in Leave Type Management automatically appear in dropdown without page refresh
- After submitting leave request, immediately update Leave Request Status section without page refresh
- Display current leave balance before submission
- Fully responsive: form fields stack vertically on mobile

##### 3.6.4.2 Leave Request Status
- Display Leave Requests table with columns: Leave Type, Start Date, End Date, Reason, Request Status, Manager Comments, Submission Date
- Request Status values: Submitted, Under Manager Review, Manager Approved, Director Review, Approved, Rejected
- Real-time status updates shown without page refresh
- Display manager comments when available
- Table features: Search by leave type, Filter by status/date range, Sort by any column, Pagination, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

##### 3.6.4.3 Leave History and Calendar
- View leave history
- Access leave calendar showing upcoming approved leaves
- Fully responsive: calendar and history views adapt to all screen sizes

#### 3.6.5 Salary & Payslips

##### 3.6.5.1 Salary Summary
- Display current salary structure with breakdown: Basic Salary, HRA, Travel Allowance, Medical Allowance, Special Allowance, PF, ESI, Tax, Other Deductions, Net Salary
- Show salary effective date
- Fully responsive: salary breakdown adapts to all screen sizes

##### 3.6.5.2 Payslip History
- Display Payslips List table with columns: Payroll Month, Payroll Year, Net Salary, Status, Actions
- Status values: Paid, Pending Payment
- Actions column includes: Download PDF Payslip button
- Table features: Search by month/year, Filter by status, Sort by any column, Pagination, Real-Time Refresh button
- Payslips automatically appear after Director runs payroll without page refresh
- Fully responsive: table scrolls horizontally on mobile

##### 3.6.5.3 Salary History
- View salary history showing past salary structures
- Access tax information
- Fully responsive: salary history adapts to all screen sizes

#### 3.6.6 Tasks
- View assigned tasks
- Update task status
- Mark tasks as completed
- View task deadlines
- Fully responsive: task lists and forms adapt to all screen sizes

#### 3.6.7 My Projects
- Display My Projects table with columns: Project Name, Description, Department, Priority, Status, Start Date, Deadline, Project Manager, Team Members, Progress Percentage
- View projects where employee is assigned as team member
- Projects created by Director automatically appear in this section when employee is selected in team members list
- Priority values: Low, Medium, High, Critical
- Status values: Pending, In Progress, Completed, Cancelled
- Table features: Search by project name, Filter by priority/status, Sort by any column, Pagination, Real-Time Refresh button
- When Director updates project details, status, or progress, changes immediately sync to My Projects without page refresh
- Access project details and timelines
- Update project progress
- Fully responsive: table scrolls horizontally on mobile

#### 3.6.8 Performance
- View performance ratings
- Access performance review feedback
- Track personal KPIs
- View goal progress
- Fully responsive: performance views adapt to all screen sizes

#### 3.6.9 Training
- Display Training Programs List table with columns: Training Name, Description, Training Date, Department, Status, Completion Progress, Certificate Status
- View training programs assigned to employee's department (department-based filtering)
- Training programs created by Director automatically appear in this tab without page refresh
- Access course materials
- Track training progress
- View earned certifications
- Table features: Search by training name, Filter by status/date, Sort by any column, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

#### 3.6.10 Career Opportunities

##### 3.6.10.1 Open Positions
- Display Open Positions List table with columns: Position Title, Department, Job Description, Required Skills, Experience, Application Deadline, Actions
- Show all open job positions company-wide
- Actions column includes: Apply button, View Details button
- Table features: Search by position title, Filter by department, Sort by any column, Pagination, Real-Time Refresh button
- Receive notification when new job opening created
- Fully responsive: table scrolls horizontally on mobile

##### 3.6.10.2 My Applications
- Display My Applications table with columns: Position Title, Department, Application Date, Status
- Status values: Submitted, Under Review, Interview Scheduled, Offer Extended, Hired, Rejected
- View own application status with real-time updates
- Table features: Search by position title, Filter by status, Sort by any column, Pagination, Real-Time Refresh button
- Receive notification when application status changes
- Fully responsive: table scrolls horizontally on mobile

##### 3.6.10.3 Apply for Position
- Display Apply for Position form when employee clicks Apply button
- Form includes: Position Title (pre-filled), Cover Letter field, Resume upload
- After submitting application, immediately add new application record to My Applications table without page refresh
- Notify department manager of new internal application
- Fully responsive: form fields stack vertically on mobile

#### 3.6.11 Company Announcements
- View all company announcements
- Read announcement details
- Mark announcements as read
- Fully responsive: announcement lists adapt to all screen sizes

#### 3.6.12 Documents
- Access personal documents (offer letter, contracts, policies)
- Download documents
- Fully responsive: document lists and download buttons adapt to all screen sizes

#### 3.6.13 Assigned Assets
- Display Assigned Assets List table with columns: Asset ID, Asset Name, Category, Serial Number, Assigned Date, Asset Status
- View list of company assets assigned to employee
- Assets assigned by Director automatically appear in this tab without page refresh
- Check asset details and assignment dates
- Table features: Search by asset name/serial number, Filter by category/status, Sort by any column, Real-Time Refresh button
- Fully responsive: table scrolls horizontally on mobile

#### 3.6.14 Help & Support
- Submit support tickets
- View ticket status
- Access help documentation
- Fully responsive: support forms and documentation adapt to all screen sizes

#### 3.6.15 Notification History
- Display all notifications in chronological order
- Filter by category: Announcement, Leave, Recruitment, Training, Asset, Project, Internship, System, Security
- Filter by status: Read, Unread
- Mark as read or delete notifications
- Navigate to relevant pages by clicking notification message
- Fully responsive: notification lists and filters adapt to all screen sizes

#### 3.6.16 Settings
- Manage account settings
- Change password
- Configure notification preferences
- Security tab: View and manage trusted devices
- Fully responsive: settings forms adapt to all screen sizes

##### 3.6.16.1 Security Tab - Trusted Devices
- Display Trusted Devices List table with columns: Device Name, Browser, Last Login Date, Status, Actions
- Device Name parsed from userAgent
- Status values: Active, Removed
- Actions column includes: Remove Device button
- When user clicks Remove Device button, device status changes to Removed and device is removed from trusted_devices table
- Next login from removed device requires OTP verification
- Table features: Search by device name, Filter by status, Sort by last login date, Pagination
- Fully responsive: table scrolls horizontally on mobile

### 3.7 Responsive Design Requirements

#### 3.7.1 Universal Responsive Principles
- All UI elements must be fully responsive across device widths: 320px, 375px, 425px, 768px, 1024px, 1280px, 1440px, 1920px
- Text must never overlap other text, buttons, cards, or containers
- Apply auto wrap, responsive scaling, proper line breaks, dynamic height adjustment
- Cards must auto-adjust height based on content, no horizontal overflow
- No full-page horizontal scrolling on any device

#### 3.7.2 Mobile Responsive Rules (320px - 767px)
- Tables become responsive: horizontal scroll inside container, or transform to card layout
- Long content scrolls inside containers, not full page
- Forms stack vertically, input fields full width
- Navigation menu collapses to hamburger icon
- Dashboard widgets stack vertically
- Buttons remain accessible, stack vertically if needed
- Dropdowns and modals adapt to screen width
- Sidebar collapses or transforms to bottom navigation

#### 3.7.3 Tablet Responsive Rules (768px - 1023px)
- Two-column layouts adapt properly
- Cards align in grid (2 columns)
- Navigation remains usable, may collapse to icon menu
- Tables may scroll horizontally or adapt to 2-column card layout
- Forms may use 2-column layout for related fields
- Dashboard widgets display in 2-column grid

#### 3.7.4 Desktop Responsive Rules (1024px - 1920px)
- Use space efficiently, maintain professional alignment
- Sidebar and content area independent, sidebar fixed or collapsible
- Dashboard widgets display in 3-4 column grid
- Tables display full width with all columns visible
- Forms use multi-column layout where appropriate
- Navigation menu fully expanded
- Cards display in 3-4 column grid

#### 3.7.5 Component-Specific Responsive Requirements
- Header: Logo and navigation adapt, hamburger menu on mobile
- Sidebar: Collapses on mobile/tablet, fixed on desktop
- Tables: Horizontal scroll on mobile, full display on desktop
- Forms: Vertical stack on mobile, multi-column on desktop
- Modals/Popups: Full width on mobile, centered with max-width on desktop
- Cards: Single column on mobile, 2-column on tablet, 3-4 column on desktop
- Buttons: Full width on mobile, auto width on desktop
- Dropdowns: Full width on mobile, auto width on desktop
- Date pickers: Adapt to screen width
- Charts/Graphs: Responsive scaling, maintain readability

## 4. Business Rules and Logic

### 4.1 Account Creation and Access Control
- Only Director can perform first-time signup
- After Director account creation, signup functionality is permanently disabled
- Only login page is accessible for future access
- Director can create both Management and Employee accounts
- Management cannot create Director accounts
- Employees cannot create any accounts
- Each user role has predefined access permissions

### 4.2 Role-Based Dashboard Routing
- After successful login, system automatically redirects users based on role:
  - Director → Director Dashboard
  - Management → Management Dashboard
  - Employee → Employee Dashboard

### 4.3 Role Selection and Validation on Login
- User selects a role (Director, Management, or Employee) before entering credentials
- System validates that the logged-in user's actual role matches the selected role
- If role mismatch occurs, system denies access and displays error message
- Only users with matching roles can proceed to their respective dashboards

### 4.4 Device Security Verification Workflow

#### 4.4.1 Device Fingerprint Generation
- When user submits login credentials, system generates device fingerprint combining: userAgent, screen resolution, platform, timezone, language
- Device fingerprint stored as device_id in localStorage
- Device_id used to identify unique devices

#### 4.4.2 Trusted Device Check
- After credential validation and role match confirmation, system checks trusted_devices table for matching device_id + user_id
- If device_id exists in trusted_devices table with is_active = true → user is logged in directly to dashboard
- If device_id does not exist in trusted_devices table → device is identified as new device

#### 4.4.3 New Device OTP Verification
- When new device detected, system does NOT redirect to dashboard
- Login page remains open and reveals inline OTP verification section below login button
- System generates random 6-digit numeric OTP
- OTP sent to user's registered email via Edge Function
- OTP stored in device_otp_verifications table with fields: user_id, device_id, otp_hash (hashed), expires_at (10 minutes from creation), attempts (initialized to 0), is_used (false), created_at
- User enters OTP in 6-digit input field and clicks Verify & Login button
- System validates OTP:
  + If OTP matches and not expired and attempts < 5 → OTP verification successful
  + If OTP does not match → increment attempts counter, display error message
  + If attempts reach 5 → invalidate OTP (set is_used = true), display error: Maximum attempts exceeded. Please resend code.
  + If OTP expired → display error: OTP has expired. Please resend code.
- After successful OTP verification:
  + Insert new record into trusted_devices table with fields: user_id, device_id, device_name (parsed from userAgent), browser (parsed from userAgent), ip_address, verified_at (current timestamp), last_login_at (current timestamp), is_active (true)
  + Mark OTP as used (set is_used = true in device_otp_verifications table)
  + Redirect user to role-specific dashboard
  + Send notification: New device login verified successfully
  + Log event in security_logs table: event_type = OTP Verification Success, status = Success

#### 4.4.4 OTP Resend Logic
- Resend Code button disabled for 30 seconds after OTP sent, with countdown timer displayed
- When user clicks Resend Code button after cooldown:
  + Invalidate previous OTP (set is_used = true in device_otp_verifications table)
  + Generate new 6-digit OTP
  + Send new OTP to user's registered email via Edge Function
  + Store new OTP in device_otp_verifications table with 10-minute expiry
  + Reset attempts counter to 0
  + Disable Resend button for 30 seconds with countdown

#### 4.4.5 OTP Security Rules
- OTP is 6-digit numeric code
- OTP expires in 10 minutes from creation
- Maximum 5 verification attempts allowed per OTP
- After 5 failed attempts, OTP is invalidated and user must resend
- Resend available after 30-second cooldown
- Resending OTP invalidates previous OTP
- OTP stored as hashed value in database

#### 4.4.6 Trusted Device Management
- Users can view trusted devices in Settings → Security tab
- Trusted Devices List displays: Device Name, Browser, Last Login Date, Status (Active/Removed)
- Users can remove trusted devices by clicking Remove Device button
- When device removed:
  + Device status changes to Removed in trusted_devices table (set is_active = false)
  + Device record removed from trusted_devices table
  + Next login from removed device requires OTP verification
  + Notification sent: Device removed from trusted devices
  + Log event in security_logs table: event_type = Device Removed, status = Success

#### 4.4.7 Security Logs Tracking
- All device security events logged in security_logs table with fields: user_id, user_name, user_role, device_id, device_name, browser, ip_address, event_type, status, created_at
- Event types tracked:
  + New Device Login (when new device detected)
  + OTP Verification Success (when OTP verified successfully)
  + OTP Verification Failed (when OTP verification fails)
  + Device Removed (when user removes trusted device)
  + Multiple Failed Attempts (when 3+ OTP verification failures occur)
- Director can view all security logs in Security Logs page
- Security logs table displays: User Name, Role, Device Name, Browser, Login Date & Time, IP Address, Verification Status, Event Type

#### 4.4.8 Security Notifications
- Notifications sent for device security events:
  + New device login attempt → notify user: New device login detected. Verification code sent to your email.
  + Successful OTP verification → notify user: New device login verified successfully.
  + Failed OTP attempts (after 3+ failures) → notify user: Multiple failed verification attempts detected on your account.
  + Device removal → notify user: Device removed from trusted devices.
- Notifications delivered in real-time via existing notification system
- Notification category: Security

### 4.5 Forgot Password Workflow

#### 4.5.1 Password Reset Request
- User clicks Forgot Password link on Login page
- System displays Forgot Password page with Email input field
- User enters email address and clicks Send Reset Link button
- System validates email format
- System checks if email exists in users table (Director, Management, Employee, Intern)
- If email not found → display error message: Account not found with this email address. Do NOT send email.
- If email exists:
  + Generate unique secure password reset token (random string, 64 characters)
  + Hash token and store in password_resets table with fields: user_id, token_hash, expires_at (30 minutes from creation), is_used (false), created_at
  + Send password reset email to user containing secure reset link: https://hrm-system.com/reset-password?token=[unique_token]
  + Display success message: Password reset link has been sent to your email address. Please check your inbox.

#### 4.5.2 Password Reset Execution
- User clicks password reset link from email
- System extracts token from URL query parameter
- System validates token:
  + Check if token exists in password_resets table
  + Check if token is not expired (expires_at > current time)
  + Check if token is not already used (is_used = false)
  + If token invalid or expired → display error message: Reset link has expired. Please request a new password reset link. Display Request New Link button.
  + If token valid → display Reset Password form
- Reset Password form contains: New Password input field, Confirm New Password input field, Update Password button
- User enters new password and confirmation, clicks Update Password button
- System validates:
  + New Password and Confirm New Password match
  + Password meets security requirements (minimum 8 characters)
  + If validation fails → display error message
  + If validation passes:
    - Hash new password
    - Update user password in users table
    - Mark token as used (set is_used = true in password_resets table)
    - Display success message: Password updated successfully. You can now login with your new password.
    - Redirect to Login page after 3 seconds

#### 4.5.3 Password Reset Security Rules
- Reset token is unique, secure, 64-character random string
- Token expires in 30 minutes from creation
- Token can only be used once (is_used flag)
- Expired or used tokens cannot reset password
- Old password immediately stops working after reset
- New password works immediately after reset
- Password reset workflow identical for all user types (Director, Management, Employee, Intern)

### 4.6 Intern Account Enable/Disable Logic
- Director can enable or disable any intern account company-wide
- Management can enable or disable intern accounts only within assigned department
- When intern account is disabled:
  - Account Status immediately changes to Disabled in database
  - Intern cannot login and sees error message: Your internship account has been disabled. Please contact the administrator.
  - Notification sent to intern: Your internship account has been disabled. Please contact the administrator.
- When intern account is enabled:
  - Account Status immediately changes to Active in database
  - Intern can login immediately
  - Notification sent to intern: Your internship account has been enabled. You can now login.
- Account status changes sync in real-time across Director Panel Intern List and Management Panel Intern List without page refresh

### 4.7 Data Access Permissions
- Director: Full access to all organizational data
- Management: Access limited to assigned department data
- Employee: Access limited to personal data only

### 4.8 Real-Time Data Synchronization
- After creating employee in Employee Management, new record immediately appears in Employee List table without page refresh
- After creating department in Department Management, new record immediately appears in Department List table without page refresh
- After creating management account in Management Accounts, new record immediately appears in Management Accounts List table without page refresh
- After creating project in Project Management, new record immediately appears in Projects List table without page refresh
- After creating project in Project Management, project immediately appears in Management Panel Project Management, Employee Panel My Projects (for assigned employees), and Intern Panel My Projects (for assigned interns) without page refresh
- After editing or deleting records in any list page, table updates immediately without page refresh
- Attendance Monitoring table automatically updates when employees check in or check out
- Intern Attendance tab in Director Internship Management displays all intern attendance records fetched from database with real-time updates
- Leave Monitoring table automatically updates when employees submit leave requests or managers approve/reject requests
- Leave Monitoring table immediately updates Request Status when Director approves or rejects leave request
- After Director creates/edits/deletes leave type in Leave Type Management, Employee Panel leave request dropdown immediately updates without page refresh
- After Director creates training program in Training Management, training automatically appears in Management Panel Training tab and Employee Panel Training tab for users in assigned department without page refresh
- After Director assigns asset to employee in Asset Management, asset immediately appears in Employee Panel Assigned Assets tab and Management Panel Asset Tracking section without page refresh
- After Director runs payroll, payroll records and payslips immediately appear in Director Panel, Management Payroll Reports, and Employee Salary & Payslips without page refresh
- After Director creates job opening, opening immediately appears in Management Panel Recruitment and Employee Panel Career Opportunities without page refresh
- After employee applies for position, application immediately appears in Management Panel Candidates and Director Panel Applicants without page refresh
- After Director or Management enables/disables intern account, Account Status immediately updates in Intern List table without page refresh
- All data changes are synchronized in real-time across all user panels

### 4.9 Dynamic Employee Filtering in Project Management
- When creating project, Department selection dropdown displays all departments
- When Department is selected, Employee assignment dropdown and Intern assignment dropdown filter to show ONLY employees and interns belonging to selected department
- When Department selection changes, Employee assignment dropdown and Intern assignment dropdown immediately update to display employees and interns from newly selected department
- If no department is selected, Employee assignment dropdown and Intern assignment dropdown remain empty or disabled

### 4.10 Project Priority Management
- Projects table includes priority column storing values: Low, Medium, High, Critical
- Priority field is required when creating project
- Priority can be updated when editing project
- Projects can be filtered and sorted by priority

### 4.11 Project Visibility and Synchronization
- When Director creates project and selects team members (employees and/or interns), project immediately appears in:
  - Management Panel Project Management (for department manager)
  - Employee Panel My Projects (for assigned employees)
  - Intern Panel My Projects (for assigned interns)
- Project details displayed: Project Name, Description, Department, Priority, Status, Start Date, Deadline, Project Manager, Team Members, Progress Percentage
- Status values: Pending, In Progress, Completed, Cancelled
- When Director updates project details, status, or progress, changes immediately sync to Management Panel, Employee Panel, and Intern Panel without page refresh
- Only team members assigned to project can view project in their My Projects section

### 4.12 Leave Type Management and Synchronization
- All leave types are stored in database leave_types table
- Director creates leave types in Leave Type Management page
- Leave types are dynamically loaded from database
- When Director creates new leave type, it immediately appears in Employee Panel leave request dropdown without page refresh
- When Director edits leave type, changes immediately reflect in Employee Panel leave request dropdown
- When Director deletes leave type, it is removed from Employee Panel leave request dropdown (only if not used in existing leave requests)
- No hardcoded leave types in system

### 4.13 Training Management and Department-Based Synchronization
- Director creates training programs and assigns to specific department
- Training programs are stored in database with department assignment
- When Director creates training program, it automatically appears in Management Panel Training tab and Employee Panel Training tab for users in assigned department without page refresh
- Department-based filtering: only Management and Employees in assigned department can view the training
- Training information displayed: Training Name, Description, Training Date, Department, Status, Completion Progress, Certificate Status
- When Director edits or deletes training program, changes immediately sync to Management Panel and Employee Panel without page refresh

### 4.14 Asset Management and Cross-Panel Synchronization
- Director registers assets and assigns to employees
- Assets are stored in database with assignment information
- When Director assigns asset to employee, asset immediately appears in Employee Panel Assigned Assets tab and Management Panel Asset Tracking section without page refresh
- Asset details displayed: Asset ID, Asset Name, Category, Serial Number, Assigned Date, Assigned To, Asset Status
- When Director updates asset assignment or status, changes immediately sync to Employee Panel and Management Panel without page refresh
- Department-based filtering in Management Panel: Management can only view assets assigned to employees in their department

### 4.15 Attendance Workflow
- Employee checks in to record arrival time
- System calculates live working hours
- Employee checks out to record departure time
- System tracks late arrivals and overtime automatically
- Attendance data is visible to Management and Director in real-time
- Attendance Monitoring table displays current day attendance by default

### 4.16 Intern Attendance Workflow
- Intern checks in to record arrival time
- System calculates live working hours
- Intern checks out to record departure time
- System tracks late arrivals and overtime automatically
- Intern attendance data is visible to Management (department-specific) and Director in real-time
- Director can view all intern attendance in Internship Management Intern Attendance tab
- Management can view intern attendance for their department in Attendance Management Intern Attendance section and Internship Management Intern Attendance List
- Intern Attendance tab in Director Internship Management fetches all intern attendance records from database and displays with real-time updates

### 4.17 Leave Approval Workflow - Hierarchical Routing
- When employee submits leave request, system identifies employee's department and finds department manager
- Leave request first routes to Department Manager with status Under Manager Review
- Employee sees status: Under Manager Review
- Department Manager reviews request in Management Panel Leave Management Pending Leave Requests section
- Manager can view request details, employee leave balance, approve, reject, or add comments
- After Manager approves: request status changes to Manager Approved and routes to Director for final approval (if policy requires) OR auto-approves to Approved status (if policy is Manager approval only)
- After Manager rejects: request status changes to Rejected
- If Director final approval required: request appears in Director Leave Monitoring with status Manager Approved
- Director can approve (status changes to Approved) or reject (status changes to Rejected)
- Employee receives real-time status updates without page refresh
- Approved leave automatically updates attendance records
- Rejected leave does not affect attendance
- Unpaid leave is flagged for payroll deduction
- Notifications sent at each status change: submission, manager approval/rejection, director approval/rejection

### 4.18 Payroll Processing Workflow
- Director creates salary structure for each employee with fields: Basic Salary, HRA, Travel Allowance, Medical Allowance, Special Allowance, PF, ESI, Tax, Other Deductions
- Director selects month/year and clicks Run Payroll button
- System validates all active employees have salary structures, displays error if missing: Salary Structure Not Assigned for [Employee Names]
- System fetches attendance records for selected month (working days, present days, absent days, late marks, overtime hours)
- System fetches leave records for selected month (paid leave, unpaid leave)
- System calculates net salary per employee: Net Salary = (Basic Salary + HRA + Travel Allowance + Medical Allowance + Special Allowance + Bonus + Overtime Amount) - (PF + ESI + Tax + Other Deductions + Unpaid Leave Deductions)
- System generates payroll records in database
- System updates Payroll Dashboard cards in real-time: Total Payroll, Paid, Pending Payment
- System generates payslips for all employees
- System sends payroll notifications to employees
- Payroll records and payslips immediately appear in Director Panel, Management Payroll Reports, and Employee Salary & Payslips without page refresh
- Director can mark payroll as paid for individual employees
- Employees can view salary summary and download payslips

### 4.19 Recruitment Workflow - Full Organization Process
- Director creates job opening with Position Title, Department, Job Description, Required Skills, Experience, Application Deadline
- Job opening immediately appears in Management Panel Recruitment (for assigned department manager) and Employee Panel Career Opportunities (for all employees) without page refresh
- Notification sent to department manager and all employees
- Employee can apply internally by submitting application with Cover Letter and Resume
- Application immediately appears in Management Panel Candidates (for department manager) and Director Panel Applicants without page refresh
- Notification sent to department manager
- Department Manager reviews candidate application, schedules interview, adds interview feedback
- Manager submits hiring recommendation to Director
- Director reviews recommendation, approves final hiring decision
- System generates offer letter for selected candidate
- Upon hire approval, system automatically creates employee account
- New employee record appears in Employee Management
- Department headcount updates
- Employee is ready for payroll and attendance tracking
- Notifications sent at each stage: application submission, interview schedule, offer extended, hire approved/rejected

### 4.20 Performance Review Cycle
- Director or Management defines KPIs for employees
- Performance is tracked throughout review period
- Management conducts performance reviews
- Performance ratings are assigned
- Employees can view their performance scores and feedback

### 4.21 Real-Time Notification System
- All notifications delivered in real-time without page refresh
- Notification triggers:
  - Announcement/Notice/Circular created by Director → notify all Management, Employees, Interns. Message: New announcement has been published. Clicking opens the announcement.
  - Training assigned → notify only assigned users (Management/Employees/Interns). Message: New training has been assigned to you.
  - New Recruitment opportunity created → notify relevant Department Managers, eligible Employees, eligible Interns. Message: New Career Opportunity available in your department.
  - Asset assigned to user → notify that user. Message: You have been assigned a new company asset. Show Asset Name, Asset ID, Assignment Date.
  - Employee submits leave → notify Department Manager. Message: New leave request submitted by employee.
  - Management approves/forwards leave → notify Director. Message: Leave request requires your review. Links to Leave Monitoring.
  - Management submits own leave request → notify Director. Message: Department Manager has submitted a leave request.
  - Employee/Intern applies for Career Opportunity → notify Department Manager + Director. Show Applicant Name, Department, Position.
  - Leave approved/rejected → notify applicant. Message: Your leave request has been approved/rejected.
  - Training assigned → notify assigned user. Message: New training has been assigned to you.
  - Asset assigned → notify assigned user. Message: You have been assigned a new company asset.
  - Project assigned → notify assigned employee/intern. Message: You have been assigned to a new project.
  - Intern account disabled → notify intern. Message: Your internship account has been disabled. Please contact the administrator.
  - Intern account enabled → notify intern. Message: Your internship account has been enabled. You can now login.
  - New device login attempt → notify user. Message: New device login detected. Verification code sent to your email.
  - Successful OTP verification → notify user. Message: New device login verified successfully.
  - Failed OTP attempts (after 3+ failures) → notify user. Message: Multiple failed verification attempts detected on your account.
  - Device removal → notify user. Message: Device removed from trusted devices.
- Notification categories: Announcement, Leave, Recruitment, Training, Asset, Project, Internship, System, Security
- Users can filter notifications by category in Notification History page
- Unread count badge updates immediately when new notification arrives
- Notification dropdown updates immediately when new notification arrives
- Notification History page updates immediately when new notification arrives

### 4.22 Advanced Download Popup Workflow
- When user clicks Export to PDF or Export to Excel button in any module, system displays Generate Report popup
- Popup contains:
  - Download Range dropdown with options: Last 30 Days, Last 3 Months, Last 6 Months, Last 1 Year, Custom Date Range
  - If Custom Date Range selected, display From Date picker and To Date picker
  - Generate PDF button
  - Generate CSV button
  - Cancel button
- After user selects date range and clicks Generate PDF or Generate CSV, system filters records by relevant date field within selected period
- System exports only matching records to PDF or CSV format
- PDF format contains: Company Name, Report Title, Generated Date, Data Table with relevant columns
- PDF excludes: sidebar, header, navigation, buttons, filters, search bar
- CSV format contains: Data Table with relevant columns

### 4.23 Print Layout Workflow
- When user clicks Print button in any module, system opens print preview
- Print output contains: Company Name, Report Title, Generated Date, Data Table with relevant columns
- Print excludes: sidebar, header, navigation, buttons, filters, search bar
- User can print directly or save as PDF

## 5. Exception and Boundary Conditions

| Scenario | Handling |
|----------|----------|
| Director attempts to signup after initial setup | System displays error message: Signup is disabled. Please use Login. |
| User enters incorrect login credentials | Display error message: Invalid credentials. Please try again. |
| User selects a role that does not match their actual account role | System displays error message: You are not authorized as [selected role]. |
| Intern with disabled account attempts to login | System displays error message: Your internship account has been disabled. Please contact the administrator. |
| New device detected during login | System reveals inline OTP verification section on login page without redirect |
| User enters incorrect OTP | System displays error message, increments attempts counter |
| User exceeds 5 OTP verification attempts | System invalidates OTP, displays error: Maximum attempts exceeded. Please resend code. |
| OTP expires before verification | System displays error: OTP has expired. Please resend code. |
| User clicks Resend Code before 30-second cooldown | Resend button remains disabled with countdown timer |
| User removes trusted device | Device status changes to Removed, next login from device requires OTP verification |
| Email delivery fails for OTP | System logs error and displays: Failed to send verification code. Please try again. |
| User attempts to verify OTP for already-used OTP | System displays error: OTP has already been used. Please resend code. |
| Multiple failed OTP attempts (3+) detected | System sends notification: Multiple failed verification attempts detected on your account. |
| User views Security Logs but no logs available | Display message: No security logs available. |
| User clicks Forgot Password link | System displays Forgot Password page with Email input field |
| User enters email not registered in system | System displays error: Account not found with this email address. Do NOT send email. |
| User enters registered email on Forgot Password page | System sends password reset email with secure link, displays success message |
| User clicks expired password reset link | System displays error: Reset link has expired. Please request a new password reset link. Display Request New Link button. |
| User clicks already-used password reset link | System displays error: Reset link has expired. Please request a new password reset link. |
| User enters mismatched passwords on Reset Password page | System displays error: Passwords do not match. |
| User enters password shorter than 8 characters | System displays error: Password must be at least 8 characters. |
| User successfully resets password | System updates password, displays success message, redirects to Login page after 3 seconds |
| User attempts to login with old password after reset | System displays error: Invalid credentials. |
| User attempts to login with new password after reset | System validates credentials successfully, proceeds with login flow |
| Password reset email delivery fails | System logs error and displays: Failed to send password reset email. Please try again. |
| Employee attempts to access another employee's data | System denies access and displays: Access Denied. |
| Management attempts to view data outside assigned department | System restricts access to department-specific data only |
| Management attempts to enable/disable intern from another department | System denies access and displays: Access Denied. You can only manage interns in your department. |
| Director Intern Attendance tab fails to fetch records from database | System displays error: Failed to load intern attendance records. Please try again. |
| Employee submits leave request with insufficient leave balance | System displays warning: Insufficient leave balance. |
| User attempts to check in twice without checking out | System prevents duplicate check-in and displays: Already checked in. |
| Director runs payroll without salary structure for some employees | System displays validation error: Salary Structure Not Assigned for [Employee Names]. |
| Director runs payroll for month with no attendance records | System displays error: No attendance records found for selected month. |
| Employee views Salary & Payslips but no payroll generated | Display empty state message: No payroll has been generated for the selected month. |
| Director marks payroll as paid for already paid employee | System prevents duplicate action and displays: Payroll already marked as paid. |
| Employee applies for job opening after application deadline | System prevents submission and displays: Application deadline has passed. |
| Employee applies for same position multiple times | System prevents duplicate application and displays: You have already applied for this position. |
| Management views Recruitment but no job openings for department | Display message: No job openings available for your department. |
| Employee views Career Opportunities but no open positions | Display message: No job openings available at this time. |
| Director approves hiring but employee account creation fails | System logs error and displays: Failed to create employee account. Please try again. |
| Manager approves leave request but employee has insufficient balance | System displays warning: Leave approved but employee has insufficient balance. |
| Manager rejects leave request without adding comments | System allows rejection but recommends adding comments for transparency. |
| Employee views Leave Requests but no leave types available | Display message: No leave types available. Please contact administrator. |
| Director configures leave policy to require Director final approval | All manager-approved requests route to Director Leave Monitoring for final approval. |
| Director configures leave policy to Manager approval only | Manager-approved requests auto-approve to Approved status without Director review. |
| Asset assignment to employee who already has the same asset | System prevents duplicate assignment and displays: Asset already assigned. |
| Director creates project without selecting department | Employee assignment dropdown and Intern assignment dropdown remain empty or disabled |
| Director creates project without selecting priority | System displays validation error: Priority is required. |
| Director changes department selection while employees/interns are already selected | Previously selected employees/interns are cleared, dropdowns update to show new department employees/interns |
| Attendance Monitoring table has no records for selected date | Display message: No attendance records found for this date. |
| Intern Attendance tab has no records for selected date | Display message: No intern attendance records found for this date. |
| Leave Monitoring table has no pending requests | Display message: No leave requests to display. |
| Director deletes leave type that is used in existing leave requests | System prevents deletion and displays: Cannot delete leave type. It is used in existing leave requests. |
| Director creates training program without assigning department | System displays validation error: Department assignment is required. |
| Management or Employee views Training tab but no training programs assigned to their department | Display message: No training programs available for your department. |
| Employee views Assigned Assets tab but no assets assigned | Display message: No assets assigned to you. |
| Management views Asset Tracking section but no assets assigned to department employees | Display message: No assets assigned to employees in your department. |
| Network connection lost during data submission | System displays error: Connection lost. Please try again. |
| Real-time refresh fails to update table | Manual Real-Time Refresh button allows user to trigger update |
| Database query fails to load leave types | System displays error: Failed to load leave types. Please try again later. |
| Real-time synchronization fails for training/asset/payroll/recruitment modules | System logs error and displays: Synchronization failed. Please refresh the page. |
| Real-time notification delivery fails | System logs error and displays: Notification delivery failed. Please check your connection. |
| User clicks Export to PDF/CSV without selecting date range in Advanced Download Popup | System displays validation error: Please select a date range. |
| User selects Custom Date Range but does not fill From Date or To Date | System displays validation error: Please select both From Date and To Date. |
| User selects From Date later than To Date in Custom Date Range | System displays validation error: From Date cannot be later than To Date. |
| No records found within selected date range for export | System displays message: No records found for the selected date range. |
| Print preview fails to load | System displays error: Failed to load print preview. Please try again. |
| Employee views My Projects but no projects assigned | Display message: No projects assigned to you. |
| Intern views My Projects but no projects assigned | Display message: No projects assigned to you. |
| Management views Project Management but no projects for department | Display message: No projects available for your department. |
| Director creates project but does not select any team members | Project is created but does not appear in any Employee/Intern My Projects section |
| Director updates project status but synchronization fails | System logs error and displays: Failed to update project status. Please try again. |
| Management views Intern Attendance but no interns in department | Display message: No interns found in your department. |
| Director views Intern Attendance tab but no intern attendance records | Display message: No intern attendance records found. |
| Management views Intern List but no interns in department | Display message: No interns found in your department. |
| Director or Management disables intern account but notification fails to send | System logs error and displays: Account disabled but notification failed to send. |
| Director or Management enables intern account but notification fails to send | System logs error and displays: Account enabled but notification failed to send. |
| User views Notification History but no notifications available | Display message: No notifications available. |
| User clicks notification but target page fails to load | System displays error: Failed to load page. Please try again. |
| User views Trusted Devices but no devices registered | Display message: No trusted devices found. |
| User removes last trusted device | System allows removal, next login requires OTP verification |
| Device fingerprint generation fails | System logs error and displays: Failed to generate device fingerprint. Please try again. |
| OTP email sending fails via Edge Function | System logs error and displays: Failed to send verification code. Please try again. |
| Security logs query fails | System displays error: Failed to load security logs. Please try again. |
| User accesses system from device width below 320px | System displays minimum width warning or applies 320px layout |
| User accesses system from device width above 1920px | System applies 1920px max-width layout with centered content |
| Text content overflows container on mobile | System applies auto wrap, responsive scaling, proper line breaks |
| Table has too many columns for mobile screen | System applies horizontal scroll inside container or transforms to card layout |
| Form has too many fields for mobile screen | System stacks fields vertically, applies full width |
| Dashboard widgets overflow on tablet | System applies 2-column grid layout |
| Sidebar overlaps content on mobile | System collapses sidebar or transforms to bottom navigation |
| Modal/popup too wide for mobile screen | System applies full width with padding |
| Dropdown menu extends beyond screen on mobile | System adjusts dropdown position or applies full width |
| Chart/graph not readable on mobile | System applies responsive scaling, maintains readability |
| Navigation menu not accessible on mobile | System collapses to hamburger icon |
| Buttons too small to tap on mobile | System applies minimum touch target size (44x44px) |
| Cards overflow horizontally on mobile | System stacks cards vertically, applies full width |

## 6. Acceptance Criteria

1. Director completes first-time setup by entering Company Name, Company Logo, Director Name, Mobile Number, Email, Password and successfully creates the organization
2. User accesses Login page, sees three role selection cards (Director with Shield icon, Management with Users icon, Employee with User icon) displayed at the top with premium dark theme and Electric Cyan (#00E5FF) accents
3. User clicks Login as Director card, the card is highlighted, login form appears below with Mobile Number/Email and Password fields
4. User enters Director credentials and submits login, system generates device fingerprint, checks trusted_devices table, finds matching device_id, redirects to Director Dashboard
5. User enters Director credentials from new device, system generates device fingerprint, checks trusted_devices table, finds no match, reveals inline OTP verification section below login button without redirect
6. Inline OTP verification section displays: Security Verification Required heading, message explaining new device detected, 6-digit OTP input field, Verify & Login button, Resend Code button (disabled for 30 seconds with countdown)
7. System generates 6-digit OTP, sends to user's registered email via Edge Function, stores in device_otp_verifications table with 10-minute expiry
8. User enters correct OTP, clicks Verify & Login button, system validates OTP, inserts device into trusted_devices table, redirects to Director Dashboard, sends notification: New device login verified successfully
9. User enters incorrect OTP, system displays error message, increments attempts counter to 1
10. User enters incorrect OTP 5 times, system invalidates OTP, displays error: Maximum attempts exceeded. Please resend code.
11. User clicks Resend Code button after 30-second cooldown, system invalidates previous OTP, generates new OTP, sends to email, stores in database, disables Resend button for 30 seconds
12. User navigates to Settings → Security tab, views Trusted Devices List table with columns: Device Name, Browser, Last Login Date, Status, Actions
13. User clicks Remove Device button for a trusted device, device status changes to Removed, device removed from trusted_devices table, notification sent: Device removed from trusted devices
14. User logs in from removed device, system detects new device, reveals inline OTP verification section
15. Director navigates to Security Logs page, views Security Logs table with columns: User Name, Role, Device Name, Browser, Login Date & Time, IP Address, Verification Status, Event Type, Actions
16. Security Logs table displays events: New Device Login, OTP Verification Success, OTP Verification Failed, Device Removed, Multiple Failed Attempts
17. User receives real-time notification when new device login detected: New device login detected. Verification code sent to your email.
18. User receives real-time notification after 3+ failed OTP attempts: Multiple failed verification attempts detected on your account.
19. User clicks Login as Employee card but enters Management credentials, system displays error: You are not authorized as Employee
20. User clicks Forgot Password link on Login page, system displays Forgot Password page with Email input field and Send Reset Link button
21. User enters unregistered email on Forgot Password page, clicks Send Reset Link button, system displays error: Account not found with this email address. No email sent.
22. User enters registered email on Forgot Password page, clicks Send Reset Link button, system generates unique secure token, stores in password_resets table with 30-minute expiry, sends password reset email with secure link, displays success message: Password reset link has been sent to your email address. Please check your inbox.
23. User clicks password reset link from email, system extracts token from URL, validates token (exists, not expired, not used), displays Reset Password page with New Password and Confirm New Password fields
24. User clicks expired password reset link, system displays error: Reset link has expired. Please request a new password reset link. Display Request New Link button.
25. User enters new password and confirmation on Reset Password page, clicks Update Password button, system validates passwords match and meet requirements (minimum 8 characters), hashes new password, updates user password in users table, marks token as used, displays success message: Password updated successfully. You can now login with your new password. Redirects to Login page after 3 seconds.
26. User attempts to login with old password after reset, system displays error: Invalid credentials.
27. User attempts to login with new password after reset, system validates credentials successfully, proceeds with login flow (device verification if needed), redirects to role-specific dashboard
28. Director logs in and creates a Management account and an Employee account, both users receive login credentials
29. Employee user selects Login as Employee, logs in with correct credentials from trusted device, is redirected to Employee Dashboard, checks in for attendance, and live working hours counter starts
30. Employee submits a leave request, system routes request to Department Manager with status Under Manager Review, Manager receives notification
31. Manager logs in, navigates to Leave Management Pending Leave Requests section, views leave request, clicks Approve button, request status changes to Manager Approved and routes to Director (if final approval required) or auto-approves to Approved (if policy is Manager approval only), Employee receives notification
32. Director navigates to Leave Monitoring page, views manager-approved request requiring final approval, clicks Approve button, request status changes to Approved, Employee receives notification, attendance records automatically updated
33. Director navigates to Employee Management page, clicks Create Employee button, fills in employee details, submits form, and new employee record immediately appears in Employee List table without page refresh
34. Director navigates to Employee Management page, clicks Export to PDF button, Generate Report popup appears with Download Range dropdown, Director selects Last 3 Months, clicks Generate PDF button, system exports PDF containing Company Name, Report Title: Employee Management Report, Generated Date, Employee Table with columns: Employee ID, Name, Department, Designation, Email, Mobile, Joining Date, Status (excluding sidebar, header, buttons, filters)
35. Director navigates to Employee Management page, clicks Print button, print preview opens showing Company Name, Report Title, Generated Date, Employee Table (excluding sidebar, header, buttons, filters), Director prints report
36. Director navigates to Payroll Management page, clicks Create Salary Structure button, selects employee, enters Basic Salary, HRA, Travel Allowance, Medical Allowance, Special Allowance, PF, ESI, Tax, Other Deductions, submits form, and salary structure immediately appears in Salary Structures List table without page refresh
37. Director selects month/year, clicks Run Payroll button, system validates salary structures, fetches attendance and leave records, calculates net salaries, generates payroll records, updates Payroll Dashboard cards (Total Payroll, Paid, Pending Payment), generates payslips, sends notifications to employees
38. Employee navigates to Salary & Payslips page, views salary summary with breakdown, accesses Payslip History table, clicks Download PDF Payslip button, and downloads payslip
39. Director navigates to Recruitment page, clicks Create Job Opening button, enters Position Title, selects Department, enters Job Description, Required Skills, Experience, Application Deadline, submits form, job opening immediately appears in Job Openings List table, Management Panel Recruitment, and Employee Panel Career Opportunities without page refresh, notifications sent to department manager and all employees
40. Employee navigates to Career Opportunities page, views Open Positions table, clicks Apply button, fills in Cover Letter, uploads Resume, submits application, application immediately appears in My Applications table, Management Panel Candidates, and Director Panel Applicants without page refresh, notification sent to department manager
41. Manager navigates to Recruitment Candidates section, views application, clicks Add Interview Feedback button, enters feedback, clicks Submit Hiring Recommendation button, recommendation sent to Director
42. Director navigates to Recruitment Applicants section, views hiring recommendation, clicks Approve Hiring button, system generates offer letter, creates employee account, new employee appears in Employee Management, department headcount updates, notifications sent
43. Director navigates to Leave Type Management page, clicks Create Leave Type button, enters Leave Type Name and Description, submits form, new leave type immediately appears in Leave Types List table and Employee Panel leave request dropdown without page refresh
44. Director navigates to Project Management page, clicks Create Project button, selects Department from dropdown, selects Priority from dropdown (Low/Medium/High/Critical), Employee assignment dropdown and Intern assignment dropdown dynamically filter to show ONLY employees and interns from selected department, Director selects team members, submits form, project immediately appears in Projects List table, Management Panel Project Management, Employee Panel My Projects (for assigned employees), and Intern Panel My Projects (for assigned interns) without page refresh
45. Employee navigates to My Projects section, views project details including Project Name, Description, Department, Priority, Status, Start Date, Deadline, Project Manager, Team Members, Progress Percentage
46. Director updates project status to In Progress and progress to 50%, changes immediately sync to Management Panel Project Management, Employee Panel My Projects, and Intern Panel My Projects without page refresh
47. Director navigates to Training Management page, clicks Create Training Program button, enters Training Name, Description, Training Date, selects Department, submits form, training program immediately appears in Training Programs List table, Management Panel Training tab, and Employee Panel Training tab for users in assigned department without page refresh
48. Director navigates to Asset Management page, clicks Register Asset button, enters Asset Name, Category, Serial Number, Purchase Date, Asset Status, submits form, asset immediately appears in Assets List table, Director assigns asset to employee, asset immediately appears in Employee Panel Assigned Assets tab and Management Panel Asset Tracking section without page refresh
49. Director navigates to Internship Management page, clicks Intern Attendance tab, views Intern Attendance table with columns: Intern ID, Intern Name, Department, Date, Check-In Time, Check-Out Time, Working Hours, Attendance Status, table displays all intern attendance records fetched from database with real-time updates
50. Director clicks Export to PDF button in Intern Attendance tab, Generate Report popup appears, Director selects Last 30 Days, clicks Generate PDF button, system exports PDF containing Company Name, Report Title: Intern Attendance Report, Generated Date, Intern Attendance Table (excluding sidebar, header, buttons, filters)
51. Management user navigates to Attendance Management page, views Employee Attendance section showing department employees and Intern Attendance section showing department interns
52. Management user navigates to Internship Management page, views Intern List with columns: Intern ID, Intern Name, Department, Mobile Number, Email, Internship Start Date, Internship End Date, Account Status, Actions (department-scoped only)
53. Management user clicks Disable button for an active intern in Intern List, intern account status immediately changes to Disabled without page refresh, intern receives notification: Your internship account has been disabled. Please contact the administrator.
54. Intern with disabled account attempts to login, system displays error message: Your internship account has been disabled. Please contact the administrator.
55. Management user clicks Enable button for a disabled intern in Intern List, intern account status immediately changes to Active without page refresh, intern receives notification: Your internship account has been enabled. You can now login.
56. Intern with enabled account logs in successfully from trusted device and is redirected to Intern Dashboard
57. Director navigates to Internship Management Intern List, clicks Disable button for an intern, intern account status immediately changes to Disabled, intern receives notification
58. Director clicks Enable button for a disabled intern, intern account status immediately changes to Active, intern receives notification
59. Director creates announcement, all Management, Employees, and Interns receive real-time notification: New announcement has been published. Clicking notification opens the announcement.
60. Director assigns training to department, assigned Management and Employees receive real-time notification: New training has been assigned to you.
61. Director creates job opening, relevant Department Manager and eligible Employees receive real-time notification: New Career Opportunity available in your department.
62. Director assigns asset to employee, employee receives real-time notification: You have been assigned a new company asset. Notification shows Asset Name, Asset ID, Assignment Date.
63. Employee submits leave request, Department Manager receives real-time notification: New leave request submitted by employee.
64. Management approves leave request, Director receives real-time notification: Leave request requires your review. Clicking notification navigates to Leave Monitoring.
65. Management submits own leave request, Director receives real-time notification: Department Manager has submitted a leave request.
66. Employee applies for Career Opportunity, Department Manager and Director receive real-time notification showing Applicant Name, Department, Position.
67. Director approves leave request, employee receives real-time notification: Your leave request has been approved.
68. Director rejects leave request, employee receives real-time notification: Your leave request has been rejected.
69. Director assigns project to employee, employee receives real-time notification: You have been assigned to a new project.
70. User clicks bell icon in header, notification dropdown displays recent notifications with unread count badge
71. User clicks notification in dropdown, notification is marked as read and user is navigated to relevant page
72. User navigates to Notification History page, views all notifications, filters by category (Announcement, Leave, Recruitment, Training, Asset, Project, Internship, System, Security), filters by status (Read, Unread)
73. User clicks Mark All as Read button in Notification History page, all unread notifications are marked as read, unread count badge updates to 0
74. User deletes notification in Notification History page, notification is removed from list
75. Management user clicks Export to CSV button in Intern Attendance List, Generate Report popup appears, Manager selects Custom Date Range, enters From Date and To Date, clicks Generate CSV button, system exports CSV containing intern attendance records within selected period
76. Management user clicks Print button in Project Management, print preview opens showing Company Name, Report Title: Project Management Report, Generated Date, Projects Table with columns: Project ID, Project Name, Department, Assigned Employees, Assigned Interns, Start Date, End Date, Priority, Status, Progress Percentage (excluding sidebar, header, buttons, filters)
77. User accesses HRM system from mobile device (375px width), all pages display correctly with responsive layout: role cards stack vertically, forms stack vertically, tables scroll horizontally inside containers, navigation collapses to hamburger menu, dashboard widgets stack vertically, no horizontal page scrolling
78. User accesses HRM system from tablet device (768px width), all pages display correctly with responsive layout: dashboard widgets display in 2-column grid, tables adapt to screen width, forms use appropriate column layout, navigation remains usable
79. User accesses HRM system from desktop device (1440px width), all pages display correctly with responsive layout: sidebar fixed, dashboard widgets display in 3-4 column grid, tables display full width with all columns visible, forms use multi-column layout, navigation fully expanded
80. User resizes browser window from 1920px to 320px, all UI elements adapt smoothly without breaking layout, text wraps properly, cards adjust height, no content overflow, no horizontal scrolling
81. User views Employee Management table on mobile (375px width), table scrolls horizontally inside container, table header remains visible, action buttons remain accessible
82. User views Dashboard on mobile (375px width), widgets stack vertically, each widget displays full width, widget content remains readable, no text overlap
83. User opens Generate Report popup on mobile (375px width), popup displays full width with padding, date pickers adapt to screen width, buttons stack vertically, all controls remain accessible
84. User accesses Login page on mobile (320px width), role cards stack vertically, login form fields display full width, buttons remain tappable (minimum 44x44px), Forgot Password link remains accessible, no text overlap
85. User accesses Forgot Password page on mobile (375px width), email input field displays full width, Send Reset Link button remains accessible, Back to Login link visible
86. User accesses Reset Password page on mobile (375px width), password input fields display full width, Update Password button remains accessible, validation messages display properly

## 7. Out of Scope for Current Release

- Multi-language support
- Integration with external payroll systems
- Biometric attendance integration
- Video interview capabilities
- Advanced AI-based performance analytics
- Mobile native applications (iOS/Android)
- Employee self-onboarding portal
- Automated tax filing
- Third-party calendar synchronization
- Advanced workflow automation builder
- Custom report builder with drag-and-drop interface
- Employee engagement surveys
- Benefits management module
- Time tracking for billable hours
- Expense reimbursement module
- Push notifications for mobile devices
- Email notification delivery
- SMS notification delivery
- Notification scheduling and batching
- Notification preferences customization per category
- Two-factor authentication via SMS
- Biometric device verification
- Hardware security key support
- IP address whitelisting
- Geolocation-based login restrictions
- Session management and concurrent login control
- Advanced fraud detection algorithms
- Security audit trail export
- Compliance reporting for security events
- Password strength meter on Reset Password page
- Password history tracking (prevent reuse of last N passwords)
- Account lockout after multiple failed login attempts
- CAPTCHA verification on login or password reset
- Social login integration (Google, Facebook, LinkedIn)
- Single Sign-On (SSO) integration
- Multi-factor authentication beyond OTP email
- Automatic password expiry and forced reset
- Security question-based password recovery
- Admin-initiated password reset for users
- Responsive design optimization for devices below 320px width
- Responsive design optimization for devices above 1920px width
- Accessibility features (WCAG compliance, screen reader support)
- Dark mode toggle (currently fixed dark theme)
- Custom theme builder
- Print layout customization options
- Advanced responsive breakpoint customization