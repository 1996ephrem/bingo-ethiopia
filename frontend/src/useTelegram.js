// Telegram Mini App SDK hook
// Wraps all tg.* calls safely so the app also works in a browser

const tg = window.Telegram?.WebApp;

export function useTelegramApp() {
  return {
    tg,
    isInsideTelegram: !!tg?.initData,

    // Tell Telegram the app is ready and expand to full height
    ready() {
      tg?.ready();
      tg?.expand();
      tg?.disableVerticalSwipes?.();   // prevent accidental close on swipe
    },

    // Sync CSS variables with Telegram's color theme
    applyTheme() {
      if (!tg) return;
      const root = document.documentElement;
      root.style.setProperty("--tg-bg",         tg.backgroundColor      || "#0d0d1f");
      root.style.setProperty("--tg-secondary",  tg.secondaryBackgroundColor || "#13132b");
      root.style.setProperty("--tg-text",       tg.themeParams?.text_color || "#e0e0e0");
      root.style.setProperty("--tg-hint",       tg.themeParams?.hint_color || "#555");
      root.style.setProperty("--tg-link",       tg.themeParams?.link_color || "#4a90d9");
      root.style.setProperty("--tg-button",     tg.themeParams?.button_color || "#4a90d9");
      root.style.setProperty("--tg-button-text",tg.themeParams?.button_text_color || "#fff");
    },

    // Show/hide Telegram's native back button
    showBackButton(onBack) {
      if (!tg?.BackButton) return;
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    },
    hideBackButton() {
      if (!tg?.BackButton) return;
      tg.BackButton.hide();
      tg.BackButton.offClick();
    },

    // Telegram's native bottom main button (big blue button)
    showMainButton(text, onClick, color = "#4a90d9") {
      if (!tg?.MainButton) return;
      tg.MainButton.setText(text);
      tg.MainButton.color = color;
      tg.MainButton.show();
      tg.MainButton.onClick(onClick);
    },
    hideMainButton() {
      if (!tg?.MainButton) return;
      tg.MainButton.hide();
      tg.MainButton.offClick();
    },

    // Haptic feedback
    haptic: {
      light:   () => tg?.HapticFeedback?.impactOccurred("light"),
      medium:  () => tg?.HapticFeedback?.impactOccurred("medium"),
      heavy:   () => tg?.HapticFeedback?.impactOccurred("heavy"),
      success: () => tg?.HapticFeedback?.notificationOccurred("success"),
      error:   () => tg?.HapticFeedback?.notificationOccurred("error"),
      warning: () => tg?.HapticFeedback?.notificationOccurred("warning"),
    },

    // Open external link (uses Telegram's in-app browser)
    openLink(url) {
      if (tg) tg.openLink(url);
      else window.open(url, "_blank");
    },

    // Get Telegram user info from initData
    getUser() {
      if (!tg?.initDataUnsafe?.user) return null;
      return tg.initDataUnsafe.user;
    },

    // Close the Mini App
    close() { tg?.close(); },
  };
}
