export const toastState = $state({
  message: '',
  type: 'success', // 'success', 'error', or 'info'
  visible: false
});

let timeoutId;

export function showToast(message, type = 'success', duration = 3000) {
  // Clear any existing timeout so rapid-fire toasts don't disappear instantly
  if (timeoutId) clearTimeout(timeoutId);
  
  toastState.message = message;
  toastState.type = type;
  toastState.visible = true;

  timeoutId = setTimeout(() => {
    toastState.visible = false;
  }, duration);
}