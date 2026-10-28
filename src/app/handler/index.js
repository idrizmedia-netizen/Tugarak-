import { attachChromeHandlers } from './chrome.js';
import { attachAuthFormsHandlers } from './authForms.js';
import { attachAdminActionsHandlers } from './adminActions.js';
import { attachAccountHandlers } from './account.js';
import { attachGroupNavHandlers } from './groupNav.js';
import { attachStudentAddHandlers } from './studentAdd.js';
import { attachGroupToolsHandlers } from './groupTools.js';
import { attachAdsHandlers } from './ads.js';
import { attachStudentEditPayHandlers } from './studentEditPay.js';

export function attachHandlers() {
  attachChromeHandlers();
  attachAuthFormsHandlers();
  attachAdminActionsHandlers();
  attachAccountHandlers();
  attachGroupNavHandlers();
  attachStudentAddHandlers();
  attachGroupToolsHandlers();
  attachAdsHandlers();
  attachStudentEditPayHandlers();
}
