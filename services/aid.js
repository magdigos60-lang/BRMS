/** Household-based aid claiming logic. */
const { supabase } = require('../config/index');

// ---------- Household-based aid: one claim per household per program ----------
async function getHouseholdMemberIds(residentId) {
  const { data: r } = await supabase.from('residents').select('household_id').eq('id', residentId).maybeSingle();
  if (!r || !r.household_id) return [residentId]; // no household linked: treated as its own household
  const { data: members } = await supabase.from('residents').select('id').eq('household_id', r.household_id);
  const ids = (members || []).map(m => m.id);
  return ids.length ? ids : [residentId];
}

// Claims the aid for the scanned resident AND closes the same aid for every other member of the household.
async function claimAidForHousehold(ben, staffId) {
  const memberIds = await getHouseholdMemberIds(ben.resident_id);
  const { data: already } = await supabase.from('aid_beneficiaries').select('id')
    .eq('program_id', ben.program_id).in('resident_id', memberIds).eq('status', 'Claimed').limit(1);
  if (already && already.length) return { ok: false };

  const stamp = { status: 'Claimed', claimed_at: new Date(), claimed_by: staffId };
  const { data: updated } = await supabase.from('aid_beneficiaries').update(stamp).eq('id', ben.id).eq('status', 'Pending').select();
  if (!updated || !updated.length) return { ok: false };

  const others = memberIds.filter(id => id !== ben.resident_id);
  if (others.length) {
    await supabase.from('aid_beneficiaries').update(stamp)
      .eq('program_id', ben.program_id).in('resident_id', others).eq('status', 'Pending');
  }
  return { ok: true, members: memberIds.length };
}

module.exports = { getHouseholdMemberIds, claimAidForHousehold };
