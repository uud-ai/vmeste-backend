function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isNowWithinBlock(block) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(block.start_time);
  const end = toMinutes(block.end_time);
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end; // блок переходит через полночь (например, сон)
}

export function computeStatus({ remaining, schedule }) {
  if (remaining <= 0) return "resting";
  const studying = schedule.some(
    (b) => b.active && b.block_type === "study" && isNowWithinBlock(b)
  );
  return studying ? "studying" : "online";
}
