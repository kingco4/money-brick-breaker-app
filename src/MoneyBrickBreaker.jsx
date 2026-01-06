import React, { useEffect, useMemo, useRef, useState } from "react";

// Helpers
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);

// Simple easing for a "graceful" fall (slight sway)
const sway = (t, seed) => Math.sin(t * 2 + seed) * 0.6 + Math.sin(t * 0.9 + seed * 2) * 0.4;

//Tunables 
const CONFIG = {
  width: 900,
  height: 560,
  // Playfield padding for walls
  wall: 18,
  // Paddle
  paddleW: 120,
  paddleH: 14,
  paddleYPad: 26,
  paddleSpeed: 0.18,
  // Ball
  ballR: 8,
  ballSpeed: 420,
  // Bricks (money)
  rows: 4,
  cols: 10,
  brickW: 76,
  brickH: 34,
  brickGapX: 10,
  brickGapY: 12,
  brickTop: 70,
  // Collectibles
  billW: 44,
  billH: 22,
  fallSpeed: 120,
  driftSpeed: 40,
  // Particles
  popParticles: 10,
  // Gameplay
  lives: 3,
};

// SVG-ish money look using divs
function MoneyBill({ w, h, label = "$", subtle = false }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        border: subtle ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(16,185,129,0.7)",
        background:
          "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.06))",
        boxShadow: subtle
          ? "0 6px 14px rgba(0,0,0,0.10)"
          : "0 10px 22px rgba(0,0,0,0.20)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.28), transparent 55%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.18), transparent 60%)",
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 6,
          fontSize: 12,
          fontWeight: 700,
          color: "rgba(16,185,129,0.9)",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 4,
          right: 6,
          fontSize: 12,
          fontWeight: 700,
          color: "rgba(16,185,129,0.9)",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: h * 0.9,
            height: h * 0.9,
            borderRadius: 999,
            border: "1px solid rgba(16,185,129,0.55)",
            background: "rgba(16,185,129,0.08)",
            display: "grid",
            placeItems: "center",
            color: "rgba(16,185,129,0.95)",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: -20,
          top: h * 0.55,
          width: w + 40,
          height: 1,
          background: "rgba(16,185,129,0.25)",
          transform: "rotate(-8deg)",
        }}
      />
    </div>
  );
}

// Main Component
export default function MoneyBrickBreaker() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const pointerXRef = useRef(CONFIG.width / 2);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [cash, setCash] = useState(0);
  const [lives, setLives] = useState(CONFIG.lives);
  const [level, setLevel] = useState(1);

  // World state stored in refs for smooth animation
  const worldRef = useRef(null);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const makeLevel = (lvl) => {
    // Money bricks layout
    const totalW = CONFIG.cols * CONFIG.brickW + (CONFIG.cols - 1) * CONFIG.brickGapX;
    const startX = (CONFIG.width - totalW) / 2;
    const bricks = [];

    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        // A few gaps for variety at higher levels
        const gapChance = Math.min(0.14, 0.02 * (lvl - 1));
        if (Math.random() < gapChance) continue;

        bricks.push({
          id: `${lvl}-${r}-${c}-${Math.random().toString(16).slice(2)}`,
          x: startX + c * (CONFIG.brickW + CONFIG.brickGapX),
          y: CONFIG.brickTop + r * (CONFIG.brickH + CONFIG.brickGapY),
          w: CONFIG.brickW,
          h: CONFIG.brickH,
          hp: 1,
          value: 10 + r * 2,
          label: "$",
          alive: true,
        });
      }
    }

    const paddle = {
      x: CONFIG.width / 2 - CONFIG.paddleW / 2,
      y: CONFIG.height - CONFIG.paddleYPad - CONFIG.paddleH,
      w: CONFIG.paddleW,
      h: CONFIG.paddleH,
      vx: 0,
    };

    const ball = {
      x: CONFIG.width / 2,
      y: paddle.y - 30,
      vx: (Math.random() < 0.5 ? -1 : 1) * CONFIG.ballSpeed * 0.7,
      vy: -CONFIG.ballSpeed,
      r: CONFIG.ballR,
      stuck: true,
    };

    return {
      lvl,
      bricks,
      paddle,
      ball,
      // falling bills to collect
      bills: [],
      // visual pop particles
      particles: [],
      // subtle screen shake
      shakeT: 0,
    };
  };

  const resetWorld = (nextLevel = 1) => {
    worldRef.current = makeLevel(nextLevel);
    setScore(0);
    setCash(0);
    setLives(CONFIG.lives);
    setLevel(nextLevel);
    setPaused(false);
    setRunning(false);
  };

  useEffect(() => {
    resetWorld(1);
  }, []);

  // Pointer controls
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const rectForEvent = () => el.getBoundingClientRect();

    const onMove = (clientX) => {
      const r = rectForEvent();
      const x = ((clientX - r.left) / r.width) * CONFIG.width;
      pointerXRef.current = clamp(x, CONFIG.wall + CONFIG.paddleW / 2, CONFIG.width - CONFIG.wall - CONFIG.paddleW / 2);
    };

    const onMouseMove = (e) => onMove(e.clientX);
    const onTouchMove = (e) => {
      if (!e.touches?.length) return;
      onMove(e.touches[0].clientX);
    };

    const onClick = () => {
      const w = worldRef.current;
      if (!w) return;

      if (!running) {
        setRunning(true);
        w.ball.stuck = false;
        return;
      }

      // If ball is stuck (after losing a life), launch it
      if (w.ball.stuck && !paused) {
        w.ball.stuck = false;
        // give it a little aim based on paddle position
        const px = w.paddle.x + w.paddle.w / 2;
        const dx = (w.ball.x - px) / (w.paddle.w / 2);
        w.ball.vx = clamp(dx, -1, 1) * CONFIG.ballSpeed * 0.85;
        w.ball.vy = -CONFIG.ballSpeed;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("pointerdown", onClick);

    const onKey = (e) => {
      if (e.key === "p" || e.key === "P") setPaused((v) => !v);
      if (e.key === "r" || e.key === "R") resetWorld(1);
      if (e.key === " ") {
        e.preventDefault();
        onClick();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onClick);
    };
  }, [running, paused]);

  // Canvas sizing for DPR
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.floor(CONFIG.width * dpr);
    c.height = Math.floor(CONFIG.height * dpr);
    c.style.width = `${CONFIG.width}px`;
    c.style.height = `${CONFIG.height}px`;
  }, [dpr]);

  // Main loop
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx) return;

    const step = (ts) => {
      rafRef.current = requestAnimationFrame(step);
      const last = lastRef.current || ts;
      const dt = Math.min(0.033, (ts - last) / 1000);
      lastRef.current = ts;

      const w = worldRef.current;
      if (!w) return;

      if (running && !paused) tick(w, dt);
      draw(ctx, w, ts / 1000);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, paused]);

  const spawnBreak = (w, brick, hitVx, hitVy) => {
    // Create a falling bill collectible at the brick location
    w.bills.push({
      id: `bill-${brick.id}`,
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h / 2,
      vx: clamp(hitVx * 0.08 + rand(-40, 40), -90, 90),
      vy: rand(30, 70),
      rot: rand(-0.4, 0.4),
      vr: rand(-1.2, 1.2),
      seed: rand(0, 10),
      t: 0,
      w: CONFIG.billW,
      h: CONFIG.billH,
      value: brick.value,
      collected: false,
      alpha: 1,
      pop: 0, // for scale-in
    });

    // Particles
    for (let i = 0; i < CONFIG.popParticles; i++) {
      w.particles.push({
        x: brick.x + brick.w / 2,
        y: brick.y + brick.h / 2,
        vx: rand(-200, 200) + hitVx * 0.1,
        vy: rand(-240, 140),
        life: rand(0.35, 0.7),
        t: 0,
        r: rand(1.5, 3.5),
      });
    }

    w.shakeT = 0.12;
  };

  const tick = (w, dt) => {
    // Paddle follows pointer smoothly
    const targetCenter = pointerXRef.current;
    const paddleCenter = w.paddle.x + w.paddle.w / 2;
    const diff = targetCenter - paddleCenter;
    w.paddle.x += diff * (1 - Math.pow(1 - CONFIG.paddleSpeed, dt * 60));
    w.paddle.x = clamp(w.paddle.x, CONFIG.wall, CONFIG.width - CONFIG.wall - w.paddle.w);

    // Ball movement
    const b = w.ball;
    if (b.stuck) {
      // stick to paddle
      b.x = w.paddle.x + w.paddle.w / 2;
      b.y = w.paddle.y - b.r - 2;
    } else {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Walls
      if (b.x - b.r < CONFIG.wall) {
        b.x = CONFIG.wall + b.r;
        b.vx *= -1;
      }
      if (b.x + b.r > CONFIG.width - CONFIG.wall) {
        b.x = CONFIG.width - CONFIG.wall - b.r;
        b.vx *= -1;
      }
      if (b.y - b.r < CONFIG.wall) {
        b.y = CONFIG.wall + b.r;
        b.vy *= -1;
      }

      // Paddle collision
      const p = w.paddle;
      if (
        b.y + b.r >= p.y &&
        b.y - b.r <= p.y + p.h &&
        b.x >= p.x &&
        b.x <= p.x + p.w &&
        b.vy > 0
      ) {
        b.y = p.y - b.r - 0.5;
        // Angle based on hit position
        const rel = (b.x - (p.x + p.w / 2)) / (p.w / 2);
        const angle = rel * (Math.PI * 0.36); 
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.cos(angle) * speed;
        const boost = 1.01;
        b.vx *= boost;
        b.vy *= boost;
      }

      // Brick collisions (AABB with circle)
      for (const br of w.bricks) {
        if (!br.alive) continue;
        const cx = clamp(b.x, br.x, br.x + br.w);
        const cy = clamp(b.y, br.y, br.y + br.h);
        const dx = b.x - cx;
        const dy = b.y - cy;
        if (dx * dx + dy * dy <= b.r * b.r) {
          const midX = br.x + br.w / 2;
          const midY = br.y + br.h / 2;
          const ox = (b.x - midX) / (br.w / 2);
          const oy = (b.y - midY) / (br.h / 2);

          if (Math.abs(ox) > Math.abs(oy)) {
            b.vx *= -1;
            b.x += Math.sign(ox) * 2;
          } else {
            b.vy *= -1;
            b.y += Math.sign(oy) * 2;
          }

          br.hp -= 1;
          if (br.hp <= 0) {
            br.alive = false;
            spawnBreak(w, br, b.vx, b.vy);
            setScore((s) => s + 50);
          } else {
            setScore((s) => s + 10);
          }
          break;
        }
      }

      // Lose life
      if (b.y - b.r > CONFIG.height + 30) {
        setLives((L) => {
          const next = L - 1;
          if (next <= 0) {
            // game over
            setRunning(false);
            setPaused(false);
            // keep world but reset ball
            b.stuck = true;
            b.vx = (Math.random() < 0.5 ? -1 : 1) * CONFIG.ballSpeed * 0.7;
            b.vy = -CONFIG.ballSpeed;
            return 0;
          }
          // reset ball to paddle
          b.stuck = true;
          b.vx = (Math.random() < 0.5 ? -1 : 1) * CONFIG.ballSpeed * 0.7;
          b.vy = -CONFIG.ballSpeed;
          return next;
        });
      }
    }

    // Bills fall and can be collected
    const p = w.paddle;
    for (const bill of w.bills) {
      if (bill.collected) {
        bill.t += dt;
        bill.alpha = Math.max(0, 1 - bill.t * 5);
        continue;
      }

      bill.t += dt;
      bill.pop = Math.min(1, bill.pop + dt * 5);

      const swayX = sway(bill.t, bill.seed) * CONFIG.driftSpeed;
      bill.x += (bill.vx + swayX) * dt;
      bill.y += (CONFIG.fallSpeed + bill.vy) * dt;
      bill.rot += bill.vr * dt * 0.6;

      // Collect with paddle
      const halfW = bill.w / 2;
      const halfH = bill.h / 2;
      const hit =
        bill.y + halfH >= p.y &&
        bill.y - halfH <= p.y + p.h &&
        bill.x + halfW >= p.x &&
        bill.x - halfW <= p.x + p.w;

      if (hit) {
        bill.collected = true;
        bill.t = 0;
        setCash((c) => c + bill.value);
        setScore((s) => s + 100);
        w.shakeT = 0.06;
      }

      // Remove if offscreen
      if (bill.y - halfH > CONFIG.height + 60) {
        bill.collected = true;
        bill.t = 999;
        bill.alpha = 0;
      }
    }

    // Trim bills
    w.bills = w.bills.filter((bll) => bll.alpha > 0.01);

    // Particles
    for (const par of w.particles) {
      par.t += dt;
      par.x += par.vx * dt;
      par.y += par.vy * dt;
      par.vy += 520 * dt;
    }
    w.particles = w.particles.filter((p2) => p2.t < p2.life);

    // Shake decay
    if (w.shakeT > 0) w.shakeT = Math.max(0, w.shakeT - dt);

    // Next level if all bricks cleared
    const remaining = w.bricks.some((br) => br.alive);
    if (!remaining) {
      setLevel((lv) => {
        const next = lv + 1;
        worldRef.current = makeLevel(next);
        // keep score/cash/lives; reset ball stuck
        worldRef.current.ball.stuck = true;
        setRunning(true);
        return next;
      });
    }
  };

  const drawRoundedRect = (ctx, x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  const draw = (ctx, w, tSec) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Shake
    let sx = 0,
      sy = 0;
    if (w.shakeT > 0) {
      const mag = 5 * (w.shakeT / 0.12);
      sx = (Math.random() - 0.5) * mag;
      sy = (Math.random() - 0.5) * mag;
    }
    ctx.translate(sx, sy);

    // Background
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

    // soft vignette
    const bg = ctx.createLinearGradient(0, 0, CONFIG.width, CONFIG.height);
    bg.addColorStop(0, "#0b1220");
    bg.addColorStop(1, "#070a12");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // decorative grid
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = "#9ca3af";
    for (let x = 0; x <= CONFIG.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CONFIG.height);
      ctx.stroke();
    }
    for (let y = 0; y <= CONFIG.height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CONFIG.width, y);
      ctx.stroke();
    }
    ctx.restore();

    // Walls
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "rgba(59,130,246,0.12)";
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.wall);
    ctx.fillRect(0, 0, CONFIG.wall, CONFIG.height);
    ctx.fillRect(CONFIG.width - CONFIG.wall, 0, CONFIG.wall, CONFIG.height);
    ctx.restore();

    // HUD
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`Score: ${score}`, CONFIG.wall + 14, 26);
    ctx.fillText(`Cash: $${cash}`, CONFIG.wall + 120, 26);
    ctx.fillText(`Lives: ${lives}`, CONFIG.wall + 240, 26);
    ctx.fillText(`Level: ${level}`, CONFIG.wall + 330, 26);

    ctx.globalAlpha = 0.8;
    ctx.font = "500 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(
      running
        ? paused
          ? "Paused (P to resume)"
          : "Move with mouse/touch • Click/Space to launch • P pause • R reset"
        : lives === 0
          ? "Game Over • Press R to restart"
          : "Click or press Space to start",
      CONFIG.width - 420,
      26
    );
    ctx.restore();

    // Bricks (money)
    for (const br of w.bricks) {
      if (!br.alive) continue;
      // draw bill look
      // base
      ctx.save();
      const x = br.x;
      const y = br.y;
      drawRoundedRect(ctx, x, y, br.w, br.h, 10);
      ctx.fillStyle = "rgba(16,185,129,0.10)";
      ctx.fill();
      ctx.strokeStyle = "rgba(16,185,129,0.60)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // shine
      const g = ctx.createLinearGradient(x, y, x + br.w, y + br.h);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(0.5, "rgba(255,255,255,0.04)");
      g.addColorStop(1, "rgba(255,255,255,0.10)");
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.9;
      ctx.fill();

      // emblem
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(16,185,129,0.25)";
      ctx.beginPath();
      ctx.arc(x + br.w / 2, y + br.h / 2, br.h * 0.42, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(16,185,129,0.55)";
      ctx.stroke();

      ctx.fillStyle = "rgba(16,185,129,0.95)";
      ctx.font = "800 14px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(br.label, x + br.w / 2, y + br.h / 2);

      // corner marks
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "700 11px ui-sans-serif, system-ui";
      ctx.fillText(br.label, x + 8, y + 6);
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(br.label, x + br.w - 8, y + br.h - 6);

      ctx.restore();
    }

    // Paddle
    {
      const p = w.paddle;
      ctx.save();
      drawRoundedRect(ctx, p.x, p.y, p.w, p.h, 999);
      const pg = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
      pg.addColorStop(0, "rgba(59,130,246,0.55)");
      pg.addColorStop(0.5, "rgba(59,130,246,0.20)");
      pg.addColorStop(1, "rgba(59,130,246,0.55)");
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.stroke();
      ctx.restore();
    }

    // Ball
    {
      const b = w.ball;
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r + 5);
      bg.addColorStop(0, "rgba(0,0,0,0.95)");
      bg.addColorStop(1, "rgba(0,0,0,0.20)");
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.restore();
    }

    // Falling bills
    for (const bill of w.bills) {
      const alpha = bill.alpha;
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;

      const scale = 0.75 + 0.25 * bill.pop;
      ctx.translate(bill.x, bill.y);
      ctx.rotate(bill.rot);
      ctx.scale(scale, scale);

      // bill shape
      const bw = bill.w;
      const bh = bill.h;
      drawRoundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 7);
      ctx.fillStyle = "rgba(16,185,129,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(16,185,129,0.65)";
      ctx.stroke();

      // inner emblem
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = "rgba(16,185,129,0.18)";
      ctx.beginPath();
      ctx.arc(0, 0, bh * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(16,185,129,0.45)";
      ctx.stroke();

      // dollar
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(16,185,129,0.95)";
      ctx.font = "800 12px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 0);

      ctx.restore();
    }

    // Particles
    if (w.particles.length) {
      ctx.save();
      for (const par of w.particles) {
        const life = 1 - par.t / par.life;
        ctx.globalAlpha = Math.max(0, life) * 0.9;
        ctx.beginPath();
        ctx.arc(par.x, par.y, par.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(16,185,129,0.7)";
        ctx.fill();
      }
      ctx.restore();
    }

    // Overlay states
    if (!running && lives > 0) {
      drawOverlay(ctx, "Money Brick Breaker", "Click / Space to start", "Collect falling bills with the paddle");
    }
    if (paused) {
      drawOverlay(ctx, "Paused", "Press P to resume", "");
    }
    if (lives === 0) {
      drawOverlay(ctx, "Game Over", "Press R to restart", `Final Cash: $${cash}`);
    }

    // reset transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const drawOverlay = (ctx, title, subtitle, hint) => {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.globalAlpha = 1;

    // Card
    const cw = 420;
    const ch = 160;
    const cx = (CONFIG.width - cw) / 2;
    const cy = (CONFIG.height - ch) / 2;

    drawRoundedRect(ctx, cx, cy, cw, ch, 22);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 26px ui-sans-serif, system-ui";
    ctx.fillText(title, cx + cw / 2, cy + 52);

    ctx.globalAlpha = 0.9;
    ctx.font = "600 14px ui-sans-serif, system-ui";
    ctx.fillText(subtitle, cx + cw / 2, cy + 92);

    if (hint) {
      ctx.globalAlpha = 0.65;
      ctx.font = "500 12px ui-sans-serif, system-ui";
      ctx.fillText(hint, cx + cw / 2, cy + 120);
    }

    ctx.restore();
  };

  const remainingBricks = useMemo(() => {
    const w = worldRef.current;
    if (!w) return 0;
    return w.bricks.filter((b) => b.alive).length;
  }, [level, running, paused, score, cash, lives]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div
        style={{
          width: CONFIG.width,
          borderRadius: 24,
          padding: 16,
          background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800, fontSize: 18 }}>
              Money Brick Breaker
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
              Break money • Watch it fall • Catch it to collect
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatPill label="Bricks" value={remainingBricks} />
            <button
              onClick={() => setPaused((p) => !p)}
              style={btnStyle()}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => resetWorld(1)}
              style={btnStyle("danger")}
            >
              Reset
            </button>
          </div>
        </div>

        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <canvas ref={canvasRef} />
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <InfoCard title="How to play" text="Move your paddle with mouse/touch. Click or press Space to launch the ball." />
          <InfoCard title="Collect money" text="When you break a bill, it falls down gracefully. Catch it with your paddle to collect cash." />
          <InfoCard title="Shortcuts" text="P pauses. R resets. Clear all bills to advance to the next level." />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
            Tip: Let the ball hit the edges of the paddle to aim.
          </div>
          <div className="flex items-center gap-2">
            <MoneyPreview />
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(kind) {
  const base = {
    padding: "10px 12px",
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
  };
  if (kind === "danger") {
    return {
      ...base,
      border: "1px solid rgba(239,68,68,0.22)",
      background: "rgba(239,68,68,0.10)",
    };
  }
  return base;
}

function StatPill({ label, value }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.9)",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ opacity: 0.7, fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function InfoCard({ title, text }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800, fontSize: 12 }}>{title}</div>
      <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}

function MoneyPreview() {
  return (
    <div className="flex items-center gap-2" style={{ opacity: 0.95 }}>
      <div style={{ transform: "scale(0.92)", transformOrigin: "right center" }}>
        <MoneyBill w={44} h={22} subtle label="$" />
      </div>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Break → fall → catch
      </div>
    </div>
  );
}

