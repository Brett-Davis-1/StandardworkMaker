function demoLink(event) {
  event.preventDefault();
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  return false;
}
