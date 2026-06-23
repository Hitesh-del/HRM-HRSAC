/**
 * notifications.ts
 * Centralised helpers for creating notifications throughout the HRM system.
 * Every public function is fire-and-forget — callers do NOT need to await.
 */
import { supabase } from '@/db/supabase';

export type NotificationCategory =
  | 'announcement'
  | 'leave'
  | 'recruitment'
  | 'training'
  | 'asset'
  | 'project'
  | 'internship'
  | 'system'
  | 'security'
  | 'meeting';

interface NotifyPayload {
  recipient_id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  link_url?: string;
  related_id?: string;
  related_table?: string;
}

async function insertNotification(payload: NotifyPayload) {
  await supabase.from('notifications').insert({
    recipient_id: payload.recipient_id,
    type: payload.category as string,
    title: payload.title,
    message: payload.message,
    category: payload.category,
    link_url: payload.link_url ?? null,
    related_id: payload.related_id ?? null,
    related_table: payload.related_table ?? null,
    is_read: false,
  });
}

async function insertMany(payloads: NotifyPayload[]) {
  if (!payloads.length) return;
  await supabase.from('notifications').insert(
    payloads.map(p => ({
      recipient_id: p.recipient_id,
      type: p.category as string,
      title: p.title,
      message: p.message,
      category: p.category,
      link_url: p.link_url ?? null,
      related_id: p.related_id ?? null,
      related_table: p.related_table ?? null,
      is_read: false,
    }))
  );
}

// ─── helpers to resolve recipients ──────────────────────────────────────────

async function getAllActiveProfileIds(roles: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', roles)
    .eq('is_active', true);
  return (data || []).map(r => r.id);
}

async function getDeptManagerIds(departmentId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'management')
    .eq('department_id', departmentId)
    .eq('is_active', true);
  return (data || []).map(r => r.id);
}

async function getDirectorIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'director')
    .eq('is_active', true);
  return (data || []).map(r => r.id);
}

// ─── Public notification creators ────────────────────────────────────────────

/** Director publishes announcement → all management, employees, interns */
export async function notifyAnnouncement(announcementId: string, title: string) {
  const ids = await getAllActiveProfileIds(['management', 'employee', 'intern']);
  await insertMany(ids.map(id => ({
    recipient_id: id,
    title: 'New Announcement',
    message: `New company announcement has been published: "${title}"`,
    category: 'announcement' as NotificationCategory,
    link_url: '/employee/announcements',
    related_id: announcementId,
    related_table: 'announcements',
  })));
}

/** Training assigned → only users in assigned department */
export async function notifyTrainingAssigned(
  trainingId: string,
  trainingName: string,
  departmentId: string,
) {
  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('department_id', departmentId)
    .in('role', ['management', 'employee', 'intern'])
    .eq('is_active', true);

  const ids = (data || []).map(r => r.id);
  await insertMany(ids.map(id => ({
    recipient_id: id,
    title: 'Training Assigned',
    message: `New training has been assigned to you: "${trainingName}"`,
    category: 'training' as NotificationCategory,
    link_url: '/employee/training',
    related_id: trainingId,
    related_table: 'training_programs',
  })));
}

/** New job opening → relevant dept manager + all employees/interns */
export async function notifyNewJobOpening(
  jobId: string,
  positionTitle: string,
  departmentId: string,
) {
  const managerIds = await getDeptManagerIds(departmentId);
  const employeeIds = await getAllActiveProfileIds(['employee', 'intern']);
  const uniqueIds = Array.from(new Set([...managerIds, ...employeeIds]));

  await insertMany(uniqueIds.map(id => ({
    recipient_id: id,
    title: 'New Career Opportunity',
    message: `New Career Opportunity available: "${positionTitle}"`,
    category: 'recruitment' as NotificationCategory,
    link_url: '/employee/careers',
    related_id: jobId,
    related_table: 'job_openings',
  })));
}

/** Asset assigned to a specific user */
export async function notifyAssetAssigned(
  recipientId: string,
  assetName: string,
  assetCode: string,
) {
  await insertNotification({
    recipient_id: recipientId,
    title: 'Asset Assigned',
    message: `You have been assigned a new company asset: ${assetName} (${assetCode})`,
    category: 'asset',
    link_url: '/employee/assets',
  });
}

/** Employee submits leave → notify their dept manager */
export async function notifyLeaveSubmitted(
  employeeName: string,
  departmentId: string,
  leaveRequestId: string,
) {
  const managerIds = await getDeptManagerIds(departmentId);
  await insertMany(managerIds.map(id => ({
    recipient_id: id,
    title: 'New Leave Request',
    message: `New leave request submitted by ${employeeName}. Please review.`,
    category: 'leave' as NotificationCategory,
    link_url: '/management/leaves',
    related_id: leaveRequestId,
    related_table: 'leave_requests',
  })));
}

/** Management approves/forwards leave → notify director */
export async function notifyLeaveForwardedToDirector(
  employeeName: string,
  leaveRequestId: string,
) {
  const directorIds = await getDirectorIds();
  await insertMany(directorIds.map(id => ({
    recipient_id: id,
    title: 'Leave Requires Review',
    message: `Leave request from ${employeeName} requires your review.`,
    category: 'leave' as NotificationCategory,
    link_url: '/director/leaves',
    related_id: leaveRequestId,
    related_table: 'leave_requests',
  })));
}

/** Management submits their own leave → notify director */
export async function notifyManagementLeaveSubmitted(
  managerName: string,
  leaveRequestId: string,
) {
  const directorIds = await getDirectorIds();
  await insertMany(directorIds.map(id => ({
    recipient_id: id,
    title: 'Manager Leave Request',
    message: `Department Manager ${managerName} has submitted a leave request.`,
    category: 'leave' as NotificationCategory,
    link_url: '/director/leaves',
    related_id: leaveRequestId,
    related_table: 'leave_requests',
  })));
}

/** Employee/Intern applies for career opportunity → notify dept manager + director */
export async function notifyJobApplication(
  applicantName: string,
  departmentId: string,
  positionTitle: string,
  applicationId: string,
) {
  const managerIds = await getDeptManagerIds(departmentId);
  const directorIds = await getDirectorIds();
  const uniqueIds = Array.from(new Set([...managerIds, ...directorIds]));
  await insertMany(uniqueIds.map(id => ({
    recipient_id: id,
    title: 'New Job Application',
    message: `New application received for "${positionTitle}" from ${applicantName}.`,
    category: 'recruitment' as NotificationCategory,
    link_url: '/director/recruitment',
    related_id: applicationId,
    related_table: 'job_applications',
  })));
}

/** Leave approved/rejected → notify applicant */
export async function notifyLeaveDecision(
  recipientId: string,
  approved: boolean,
  leaveRequestId: string,
) {
  await insertNotification({
    recipient_id: recipientId,
    title: approved ? 'Leave Approved' : 'Leave Rejected',
    message: approved
      ? 'Your leave request has been approved.'
      : 'Your leave request has been rejected.',
    category: 'leave',
    link_url: '/employee/leaves',
    related_id: leaveRequestId,
    related_table: 'leave_requests',
  });
}

/** Project assigned to user */
export async function notifyProjectAssigned(
  recipientId: string,
  projectName: string,
  projectId: string,
  isIntern = false,
) {
  await insertNotification({
    recipient_id: recipientId,
    title: 'Project Assigned',
    message: `You have been assigned to a new project: "${projectName}"`,
    category: 'project',
    link_url: isIntern ? '/employee/projects' : '/employee/projects',
    related_id: projectId,
    related_table: 'projects',
  });
}

/** Intern account disabled */
export async function notifyInternDisabled(internProfileId: string) {
  await insertNotification({
    recipient_id: internProfileId,
    title: 'Account Disabled',
    message: 'Your internship account has been disabled. Please contact the administrator.',
    category: 'internship',
  });
}

/** Intern account enabled */
export async function notifyInternEnabled(internProfileId: string) {
  await insertNotification({
    recipient_id: internProfileId,
    title: 'Account Enabled',
    message: 'Your internship account has been enabled. You can now login.',
    category: 'internship',
  });
}

// ─── Security Notifications ───────────────────────────────────────────────────

/** New device login detected — OTP sent */
export async function notifyNewDeviceLogin(userId: string, deviceName: string) {
  await insertNotification({
    recipient_id: userId,
    title: 'New Device Login Detected',
    message: `A login from a new device (${deviceName}) was detected. A verification code has been sent to your email.`,
    category: 'security',
  });
}

/** OTP verification successful — device trusted */
export async function notifyOtpVerified(userId: string, deviceName: string) {
  await insertNotification({
    recipient_id: userId,
    title: 'New Device Verified',
    message: `Your new device (${deviceName}) has been verified and added to your trusted devices.`,
    category: 'security',
  });
}

/** Multiple failed OTP attempts */
export async function notifyMultipleFailedOtp(userId: string) {
  await insertNotification({
    recipient_id: userId,
    title: 'Multiple Failed Verification Attempts',
    message: 'Multiple failed verification attempts were detected on your account. If this was not you, please secure your account.',
    category: 'security',
  });
}

/** Device removed from trusted list */
export async function notifyDeviceRemoved(userId: string, deviceName: string) {
  await insertNotification({
    recipient_id: userId,
    title: 'Trusted Device Removed',
    message: `The device "${deviceName}" has been removed from your trusted devices. You will need to verify again on next login.`,
    category: 'security',
  });
}

// ─── Meeting Notifications ────────────────────────────────────────────────────

/** Meeting created → notify all participants */
export async function notifyMeetingCreated(
  meetingId: string,
  title: string,
  startTime: string,
  participantIds: string[],
  organizerRole: string,
) {
  const date = new Date(startTime).toLocaleString();
  const baseUrl = organizerRole === 'employee' ? '/employee/meetings' : '/employee/meetings';
  await insertMany(participantIds.map(id => ({
    recipient_id: id,
    title: 'Meeting Scheduled',
    message: `You have been invited to "${title}" scheduled for ${date}.`,
    category: 'meeting' as NotificationCategory,
    link_url: baseUrl,
    related_id: meetingId,
    related_table: 'meetings',
  })));
}

/** Meeting updated → notify all participants */
export async function notifyMeetingUpdated(
  meetingId: string,
  title: string,
  startTime: string,
  participantIds: string[],
) {
  const date = new Date(startTime).toLocaleString();
  await insertMany(participantIds.map(id => ({
    recipient_id: id,
    title: 'Meeting Updated',
    message: `The meeting "${title}" has been updated. New time: ${date}.`,
    category: 'meeting' as NotificationCategory,
    link_url: '/employee/meetings',
    related_id: meetingId,
    related_table: 'meetings',
  })));
}

/** Meeting cancelled → notify all participants */
export async function notifyMeetingCancelled(
  meetingId: string,
  title: string,
  participantIds: string[],
) {
  await insertMany(participantIds.map(id => ({
    recipient_id: id,
    title: 'Meeting Cancelled',
    message: `The meeting "${title}" has been cancelled.`,
    category: 'meeting' as NotificationCategory,
    link_url: '/employee/meetings',
    related_id: meetingId,
    related_table: 'meetings',
  })));
}
