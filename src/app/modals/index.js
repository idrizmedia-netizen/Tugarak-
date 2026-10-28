import { renderAttendanceModal, renderAttendanceReportModal, renderCoTeachersModal, renderDeleteGroupConfirmModal, renderEditGroupModal, renderGroupDocsModal, renderGroupSettingsModal, renderNewGroupModal, renderNewYearModal, renderPaySettingsModal, renderQuarterlyModal, renderReportsMenuModal } from './group.js';
import { renderAddGradeModal, renderAddStudentModal, renderEditGradeModal, renderEditStudentModal, renderStudentArchiveModal, renderStudentPayModal } from './student.js';
import { renderNotificationsModal, renderProfileModal, renderRejectReasonModal, renderResubmitModal } from './account.js';
import { state } from '../state.js';

const MODAL_RENDERERS = {
  newYear: renderNewYearModal,
  studentArchive: renderStudentArchiveModal,
  editStudent: renderEditStudentModal,
  editGrade: renderEditGradeModal,
  paySettings: renderPaySettingsModal,
  studentPay: renderStudentPayModal,
  newGroup: renderNewGroupModal,
  addStudent: renderAddStudentModal,
  addGrade: renderAddGradeModal,
  reportsMenu: renderReportsMenuModal,
  groupSettings: renderGroupSettingsModal,
  notifications: renderNotificationsModal,
  quarterly: renderQuarterlyModal,
  rejectReason: renderRejectReasonModal,
  resubmit: renderResubmitModal,
  profile: renderProfileModal,
  editGroup: renderEditGroupModal,
  deleteGroupConfirm: renderDeleteGroupConfirmModal,
  groupDocs: renderGroupDocsModal,
  attendance: renderAttendanceModal,
  attendanceReport: renderAttendanceReportModal,
  coTeachers: renderCoTeachersModal,
};

export function renderModal() {
  if (!state.modal) return '';
  const m = state.modal;
  const fn = MODAL_RENDERERS[m.type];
  return (fn ? fn(m) : '') ?? '';
}
