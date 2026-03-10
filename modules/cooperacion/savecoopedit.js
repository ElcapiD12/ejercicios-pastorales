async function saveCoopEdit() {
  const memberId  = document.getElementById('coopEditMemberId').value;
  const coopId    = document.getElementById('coopEditCoopId').value;
  const monto     = parseFloat(document.getElementById('coopEditMonto').value);
  const anticipo  = parseFloat(document.getElementById('coopEditAnticipo').value) || 0;
  const liquidado = document.getElementById('coopEditLiquidado').checked;
  const notas     = document.getElementById('coopEditNotas').value.trim();
  const concepto  = document.getElementById('coopEditConcepto')?.value || 'cooperacion';
  const errEl     = document.getElementById('coopEditError');

  errEl.textContent = '';

  if (isNaN(monto) || monto <= 0) { errEl.textContent = 'El monto debe ser mayor a 0.'; return; }
  if (anticipo > monto)            { errEl.textContent = 'El anticipo no puede ser mayor al monto.'; return; }

  const payload = {
    member_id: memberId, monto, anticipo, liquidado, notas,
    concepto,
    updated_at: new Date().toISOString()
  };

  if (coopId) {
    const { error } = await sb.from('cooperaciones').update(payload).eq('id', coopId);
    if (error) { errEl.textContent = 'Error al actualizar.'; return; }
  } else {
    const { error } = await sb.from('cooperaciones').insert(payload);
    if (error) { errEl.textContent = 'Error al guardar.'; return; }
  }

  closeModal('modalCoopEdit');
  showToast('Cooperación actualizada.');

  // Obtener datos del miembro y ejercicio activo para el comprobante
  const [{ data: memData }, { data: ejercicios }] = await Promise.all([
    sb.from('members').select('phone, full_name').eq('member_id', memberId).single(),
    sb.from('ejercicios').select('title').eq('estado', 'activo').eq('group_id', currentUser?.group_id).limit(1),
  ]);

  if (memData?.phone) {
    enviarWhatsApp({
      memberId,
      fullName:       memData.full_name,
      phone:          memData.phone,
      monto,
      anticipo,
      liquidado,
      groupName:      currentGroup?.name || 'Ejercicios Pastorales',
      concepto,
      ejercicioNombre: ejercicios?.[0]?.title || 'Ejercicio activo',
    });
  }

  await loadCooperaciones();
  renderCooperaciones(document.querySelector('.coop-filter-btn.active')?.dataset.filter || 'todos');
  renderResumen();
}