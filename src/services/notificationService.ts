export const requestNotificationPermission = async () => {
  return new Promise((resolve) => setTimeout(() => resolve(true), 500));
};

export const setupNotificationListeners = () => {
  console.log('FCM Listeners initialized (Mock).');
};
