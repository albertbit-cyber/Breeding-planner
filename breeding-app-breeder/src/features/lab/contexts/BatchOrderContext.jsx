import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CART_STORAGE_KEY = "breedingPlannerBatchOrderCart";
const CART_LAB_STORAGE_KEY = "breedingPlannerBatchOrderLab";

const BatchOrderContext = createContext(null);

export function BatchOrderProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  /**
   * The laboratory this cart is addressed to.
   *
   * One cart goes to one lab, and it has to be chosen before tests can be
   * picked: each lab publishes its own tests at its own prices, so a selection
   * made against one lab's list means nothing at another. Changing the lab
   * therefore empties the cart rather than carrying over test ids that the new
   * lab may not offer at all.
   */
  const [selectedLab, setSelectedLab] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_LAB_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // storage not available
    }
  }, [cartItems]);

  useEffect(() => {
    try {
      if (selectedLab) localStorage.setItem(CART_LAB_STORAGE_KEY, JSON.stringify(selectedLab));
      else localStorage.removeItem(CART_LAB_STORAGE_KEY);
    } catch {
      // storage not available
    }
  }, [selectedLab]);

  const addToCart = useCallback((snake, selectedTestIds) => {
    const snakeId = String(snake?.id || "").trim();
    const snakeName = String(snake?.name || "").trim() || snakeId;
    if (!snakeId || !Array.isArray(selectedTestIds) || !selectedTestIds.length) return;
    const deduped = Array.from(new Set(selectedTestIds.map((id) => String(id || "").trim()).filter(Boolean)));
    setCartItems((prev) => {
      const exists = prev.some((item) => item.snakeId === snakeId);
      if (exists) {
        return prev.map((item) =>
          item.snakeId === snakeId ? { ...item, snakeName, selectedTestIds: deduped } : item
        );
      }
      return [...prev, { snakeId, snakeName, selectedTestIds: deduped }];
    });
  }, []);

  const removeFromCart = useCallback((snakeId) => {
    setCartItems((prev) => prev.filter((item) => item.snakeId !== String(snakeId || "")));
  }, []);

  const updateTests = useCallback((snakeId, selectedTestIds) => {
    const deduped = Array.from(new Set((selectedTestIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
    setCartItems((prev) =>
      prev.map((item) =>
        item.snakeId === String(snakeId || "") ? { ...item, selectedTestIds: deduped } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

  const chooseLab = useCallback((lab) => {
    const nextId = String(lab?.organizationId || "").trim();
    setSelectedLab((previous) => {
      const previousId = String(previous?.organizationId || "").trim();
      // Switching labs discards the staged selection: those test ids belong to
      // the previous lab's catalogue and would silently fail against the new one.
      if (previousId && nextId && previousId !== nextId) setCartItems([]);
      return nextId ? { organizationId: nextId, labName: String(lab?.labName || "").trim() } : null;
    });
  }, []);

  const isInCart = useCallback(
    (snakeId) => cartItems.some((item) => item.snakeId === String(snakeId || "")),
    [cartItems]
  );

  const getCartItem = useCallback(
    (snakeId) => cartItems.find((item) => item.snakeId === String(snakeId || "")) || null,
    [cartItems]
  );

  const value = useMemo(
    () => ({
      cartItems,
      addToCart,
      removeFromCart,
      updateTests,
      clearCart,
      isInCart,
      getCartItem,
      selectedLab,
      selectedLabId: selectedLab?.organizationId || "",
      chooseLab,
    }),
    [cartItems, addToCart, removeFromCart, updateTests, clearCart, isInCart, getCartItem, selectedLab, chooseLab]
  );

  return <BatchOrderContext.Provider value={value}>{children}</BatchOrderContext.Provider>;
}

export function useBatchOrder() {
  const ctx = useContext(BatchOrderContext);
  if (!ctx) throw new Error("useBatchOrder must be used inside BatchOrderProvider");
  return ctx;
}
