/** Default category set seeded into every new user's space. */

export type DefaultCategory = {
  name: string;
  type: "EXPENSE" | "INCOME";
  icon: string;
  color: string;
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Food", type: "EXPENSE", icon: "🍽️", color: "#e35d5d" },
  { name: "Eating out", type: "EXPENSE", icon: "☕", color: "#f2a13c" },
  { name: "Bills", type: "EXPENSE", icon: "🧾", color: "#f2c53c" },
  { name: "Transport", type: "EXPENSE", icon: "🚌", color: "#8bc34a" },
  { name: "Car", type: "EXPENSE", icon: "🚗", color: "#4fb0e6" },
  { name: "Taxi", type: "EXPENSE", icon: "🚕", color: "#ffb300" },
  { name: "House", type: "EXPENSE", icon: "🏠", color: "#7986cb" },
  { name: "Entertainment", type: "EXPENSE", icon: "🎬", color: "#ba68c8" },
  { name: "Health", type: "EXPENSE", icon: "💊", color: "#4dd0a6" },
  { name: "Sports", type: "EXPENSE", icon: "🏸", color: "#26a69a" },
  { name: "Clothes", type: "EXPENSE", icon: "👕", color: "#f06292" },
  { name: "Gifts", type: "EXPENSE", icon: "🎁", color: "#e57373" },
  { name: "Communications", type: "EXPENSE", icon: "📱", color: "#64b5f6" },
  { name: "Pets", type: "EXPENSE", icon: "🐾", color: "#a1887f" },
  { name: "Toiletry", type: "EXPENSE", icon: "🧴", color: "#90a4ae" },
  { name: "Other", type: "EXPENSE", icon: "📦", color: "#9e9e9e" },
  { name: "Salary", type: "INCOME", icon: "💼", color: "#66bb6a" },
  { name: "Savings", type: "INCOME", icon: "🏦", color: "#26c6da" },
  { name: "Deposits", type: "INCOME", icon: "💰", color: "#9ccc65" },
];

export const CATEGORY_ICONS = [
  "🍽️","☕","🧾","🚌","🚗","🚕","🏠","🎬","💊","🏸","👕","🎁","📱","🐾","🧴","📦",
  "💼","🏦","💰","🛒","✈️","🎓","📚","💳","🔧","🌴","👶","🎮","💇","⚡","💧","🛡️",
];

export const ACCOUNT_ICONS = ["💵", "💳", "🏦", "📱", "💰", "🪙"];
