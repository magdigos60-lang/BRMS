/** Resident category (Senior, PWD, ...) helpers and checkboxes. */


// ---------- Resident categories (College Student / Household Head / Senior Citizen / PWD) ----------
const categoryFlags = (b) => ({
  is_college_student: !!b.cat_college,
  is_household_head: !!b.cat_head,
  is_senior_citizen: !!b.cat_senior,
  is_pwd: !!b.cat_pwd
});

const categoryTags = (r) => [
  r.is_college_student && 'College Student',
  r.is_household_head && 'Household Head',
  r.is_senior_citizen && 'Senior Citizen',
  r.is_pwd && 'PWD'
].filter(Boolean);

const renderCategoryCheckboxes = (r = {}, prefix = 'cat') => `
  <div class="row g-2">
    <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="cat_college" id="${prefix}College" ${r.is_college_student ? 'checked' : ''}><label class="form-check-label" for="${prefix}College">College Student</label></div></div>
    <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="cat_head" id="${prefix}Head" ${r.is_household_head ? 'checked' : ''}><label class="form-check-label" for="${prefix}Head">Household Head</label></div></div>
    <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="cat_senior" id="${prefix}Senior" ${r.is_senior_citizen ? 'checked' : ''}><label class="form-check-label" for="${prefix}Senior">Senior Citizen</label></div></div>
    <div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="cat_pwd" id="${prefix}Pwd" ${r.is_pwd ? 'checked' : ''}><label class="form-check-label" for="${prefix}Pwd">Person with Disability (PWD)</label></div></div>
  </div>`;

module.exports = { categoryFlags, categoryTags, renderCategoryCheckboxes };
