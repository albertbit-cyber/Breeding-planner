import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CART_STORAGE_KEY = "breedingPlannerBatchOrderCart";

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

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // storage not available
    }
  }, [cartItems]);

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

  const isInCart = useCallback(
    (snakeId) => cartItems.some((item) => item.snakeId === String(snakeId || "")),
    [cartItems]
  );

  const getCartItem = useCallback(
    (snakeId) => cartItems.find((item) => item.snakeId === String(snakeId || "")) || null,
    [cartItems]
  );

  const value = useMemo(
    () => ({ cartItems, addToCart, removeFromCart, updateTests, clearCart, isInCart, getCartItem }),
    [cartItems, addToCart, removeFromCart, updateTests, clearCart, isInCart, getCartItem]
  );

  return <BatchOrderContext.Provider value={value}>{children}</BatchOrderContext.Provider>;
}

export function useBatchOrder() {
  const ctx = useContext(BatchOrderContext);
  if (!ctx) throw new Error("useBatchOrder must be used inside BatchOrderProvider");
  return ctx;
}
