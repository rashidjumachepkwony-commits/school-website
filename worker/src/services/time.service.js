const kenyaTime = new Date();
const KENYA_OFFSET = 3;

function toKenya(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + KENYA_OFFSET * 3600000);
}

export function getKenyaTime() {
  return toKenya(new Date());
}

export function getKenyaDate() {
  return toKenya(new Date()).toISOString().split('T')[0];
}

export function getKenyaHour() {
  return toKenya(new Date()).getHours();
}

export function kenyaDateStr() {
  return toKenya(new Date()).toISOString().split('T')[0];
}

export function formatKenyaTime(date = new Date()) {
  const k = toKenya(date);
  const hours = k.getHours().toString().padStart(2, '0');
  const minutes = k.getMinutes().toString().padStart(2, '0');
  const seconds = k.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatKenyaFullTime(date = new Date()) {
  return formatKenyaTime(date);
}

export function formatKenyaDate(date = new Date()) {
  const k = toKenya(date);
  const year = k.getFullYear();
  const month = (k.getMonth() + 1).toString().padStart(2, '0');
  const day = k.getDate().toString().padStart(2, '0');
  return `${day}/${month}/${year}`;
}
