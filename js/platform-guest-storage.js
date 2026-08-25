/**
 * sessionStorage access with try/catch for guest/offline paths.
 */
(function () {
  function getItem(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function setItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeItem(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  window.PlatformGuestStorage = {
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
  };
})();
