if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await registration.update();
    } catch {}
  });
}
