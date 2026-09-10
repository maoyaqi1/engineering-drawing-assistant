// 尺规作图纯几何工具：只接收 {x,y} 对象并返回数据，不碰 DOM / 渲染。
const EPS = 1e-9;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function eqTol(a, b, tol) {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

// 两直线交点（无限长）。p1,p2 直线1；p3,p4 直线2。平行返回 null。
function lineLineIntersect(p1, p2, p3, p4) {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(p3, p1), d2) / den;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

// 直线（p1->p2）与圆（c,r）交点，最多 2 个。返回数组（可能 0/1/2）。
function lineCircleIntersect(p1, p2, c, r) {
  const d = sub(p2, p1);
  const len2 = d.x * d.x + d.y * d.y;
  if (len2 < EPS) return [];
  const f = sub(p1, c);
  const a = len2;
  const b = 2 * (f.x * d.x + f.y * d.y);
  const cc = f.x * f.x + f.y * f.y - r * r;
  let disc = b * b - 4 * a * cc;
  if (disc < -EPS) return [];
  if (disc < 0) disc = 0;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  const res = [];
  const first = { x: p1.x + d.x * t0, y: p1.y + d.y * t0 };
  res.push(first);
  if (s > EPS) {
    const second = { x: p1.x + d.x * t1, y: p1.y + d.y * t1 };
    res.push(second);
  }
  return res;
}

// 两圆交点（c1,r1 c2,r2），最多 2 个。
function circleCircleIntersect(c1, r1, c2, r2) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < EPS) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -EPS) return [];
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = c1.x + (a * dx) / d;
  const my = c1.y + (a * dy) / d;
  const px = (-dy * h) / d;
  const py = (dx * h) / d;
  const res = [{ x: mx + px, y: my + py }];
  if (h > EPS) res.push({ x: mx - px, y: my - py });
  return res;
}

module.exports = {
  dist: dist,
  eqTol: eqTol,
  lineLineIntersect: lineLineIntersect,
  lineCircleIntersect: lineCircleIntersect,
  circleCircleIntersect: circleCircleIntersect
};
