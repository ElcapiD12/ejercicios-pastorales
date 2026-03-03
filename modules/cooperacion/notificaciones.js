// ═══════════════════════════════════════════
//  NOTIFICACIONES — EmailJS + WhatsApp
// ═══════════════════════════════════════════

const EMAILJS_SERVICE_ID  = 'service_3c8fh4h';
const EMAILJS_TEMPLATE_ID = 'template_w1m594s';
const EMAILJS_PUBLIC_KEY  = '7OZtTZC07D52OTEja';

// ─── Inicializar EmailJS
(function() {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  script.onload = () => emailjs.init(EMAILJS_PUBLIC_KEY);
  document.head.appendChild(script);
})();

// ─── Enviar correo de bienvenida
async function enviarCorreoBienvenida(nombre, email, password, groupName, role) {
  const ROLE_LABELS_MAIL = {
    administrador: 'Administrador', secretario: 'Secretario',
    contador: 'Contador', registrador: 'Registrador', equipo: 'Equipo Base',
  };

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_name:    nombre,
      to_email:   email,
      user_email: email,
      password:   password,
      group_name: groupName,
      role:       ROLE_LABELS_MAIL[role] || role,
    });
    showToast('Correo de bienvenida enviado.');
  } catch (err) {
    console.error('Error enviando correo:', err);
    showToast('Usuario creado. Error al enviar correo.');
  }
}

// ─── Enviar comprobante por WhatsApp
function enviarWhatsApp(memberId, fullName, phone, monto, anticipo, liquidado, groupName) {
  if (!phone) {
    showToast('El miembro no tiene teléfono registrado.');
    return;
  }

  const pendiente = liquidado ? 0 : monto - anticipo;

  let mensaje = `Hola ${fullName} 👋\n\n`;
  mensaje    += `Tu pago ha sido registrado en *Ejercicios Pastorales*.\n\n`;
  mensaje    += `📋 *Grupo:* ${groupName}\n`;
  mensaje    += `💰 *Monto total:* ${formatMoney(monto)}\n`;

  if (liquidado) {
    mensaje += `✅ *Estado:* ¡Pago completado!\n`;
    mensaje += `\n¡Muchas gracias por tu aportación! 🙏`;
  } else {
    mensaje += `💵 *Abonado:* ${formatMoney(anticipo)}\n`;
    mensaje += `⏳ *Saldo pendiente:* ${formatMoney(pendiente)}\n`;
    mensaje += `\n¡Gracias por tu abono! Recuerda liquidar tu saldo. 🙏`;
  }

  const telLimpio   = phone.replace(/\D/g, '');
  const telCompleto = telLimpio.startsWith('52') ? telLimpio : `52${telLimpio}`;
  const url         = `https://wa.me/${telCompleto}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}