/** Role groups used for access control. */


// Role groups used for access control across the app
const STAFF_ROLES = ['Super Admin', 'Barangay Admin', 'Barangay Secretary', 'Barangay Staff'];
const AID_MANAGER_ROLES = ['Super Admin', 'Barangay Admin', 'Barangay Secretary'];
const RESIDENT_EDIT_ROLES = ['Super Admin', 'Barangay Admin', 'Barangay Secretary'];
const STAFF_ACCOUNT_ROLES = ['Barangay Admin', 'Barangay Secretary', 'Barangay Staff'];

module.exports = { STAFF_ROLES, AID_MANAGER_ROLES, RESIDENT_EDIT_ROLES, STAFF_ACCOUNT_ROLES };
