import {
  GameState,
  Unit,
  Base,
  COLORS,
  UNIT_SIZE_METERS,
  BASE_SIZE_METERS,
  UNIT_DEFINITIONS,
  Projectile,
  LASER_RANGE,
} from './types';
import { positionToPixels, metersToPixels, distance, add, scale, normalize, subtract } from './gameUtils';
import { Obstacle } from './maps';

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState, canvas: HTMLCanvasElement, selectionRect?: { x1: number; y1: number; x2: number; y2: number } | null): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground(ctx, canvas, state);

  if (state.mode === 'game' || state.mode === 'countdown') {
    drawObstacles(ctx, state);
    drawBases(ctx, state);
    
    if (state.mode === 'game') {
      drawCommandQueues(ctx, state);
      drawProjectiles(ctx, state);
      drawUnits(ctx, state);
      drawSelectionIndicators(ctx, state);
      if (selectionRect) {
        drawSelectionRect(ctx, selectionRect, state);
      }
      drawVisualFeedback(ctx, state);
      drawHUD(ctx, state);
    }
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state?: GameState): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw topography lines if available
  if (state?.topographyLines && state.topographyLines.length > 0) {
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.15)'; // Gray with low opacity
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    state.topographyLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    });
  }

  ctx.strokeStyle = COLORS.pattern;
  ctx.lineWidth = 1;

  const gridSize = 40;
  for (let x = 0; x < canvas.width; x += gridSize) {
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const spacing = 80;
  for (let x = 0; x < canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.obstacles.forEach((obstacle) => {
    const screenPos = positionToPixels(obstacle.position);
    const width = metersToPixels(obstacle.width);
    const height = metersToPixels(obstacle.height);

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(obstacle.rotation);

    if (obstacle.type === 'wall') {
      ctx.fillStyle = 'oklch(0.30 0.15 240)';
      ctx.strokeStyle = 'oklch(0.55 0.22 240)';
      ctx.lineWidth = 2;
      
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'oklch(0.55 0.22 240)';
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      ctx.shadowBlur = 0;
    } else if (obstacle.type === 'pillar') {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
      gradient.addColorStop(0, 'oklch(0.45 0.20 280)');
      gradient.addColorStop(1, 'oklch(0.25 0.15 280)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'oklch(0.65 0.25 280)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'oklch(0.65 0.25 280)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (obstacle.type === 'debris') {
      ctx.fillStyle = 'oklch(0.35 0.12 25)';
      ctx.strokeStyle = 'oklch(0.58 0.20 25)';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.moveTo(-width / 2, -height / 3);
      ctx.lineTo(width / 3, -height / 2);
      ctx.lineTo(width / 2, height / 3);
      ctx.lineTo(-width / 3, height / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'oklch(0.58 0.20 25)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  });
}

function drawCommandQueues(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.units.forEach((unit) => {
    const color = state.players[unit.owner].color;
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;

    let lastPos = unit.position;

    unit.commandQueue.forEach((node, index) => {
      const screenPos = positionToPixels(node.position);

      if (node.type === 'move') {
        const lastScreenPos = positionToPixels(lastPos);
        ctx.beginPath();
        ctx.moveTo(lastScreenPos.x, lastScreenPos.y);
        ctx.lineTo(screenPos.x, screenPos.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 4, 0, Math.PI * 2);
        ctx.fill();

        lastPos = node.position;
      } else if (node.type === 'ability') {
        const dir = normalize(node.direction);
        const arrowLen = 12;
        const arrowEnd = add(node.position, scale(dir, 0.5));
        const arrowEndScreen = positionToPixels(arrowEnd);

        ctx.save();
        ctx.translate(arrowEndScreen.x, arrowEndScreen.y);
        const angle = Math.atan2(dir.y, dir.x);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(arrowLen, 0);
        ctx.lineTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        lastPos = node.position;
      }
    });

    ctx.globalAlpha = 1.0;
  });
}

function drawBases(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.bases.forEach((base) => {
    let screenPos = positionToPixels(base.position);
    const size = metersToPixels(BASE_SIZE_METERS);
    const color = state.players[base.owner].color;

    if (state.matchStartAnimation && state.matchStartAnimation.phase === 'bases-sliding') {
      const elapsed = Date.now() - state.matchStartAnimation.startTime;
      const progress = Math.min(elapsed / 1500, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      if (base.owner === 0) {
        const startY = -size;
        const endY = screenPos.y;
        screenPos = { x: screenPos.x, y: startY + (endY - startY) * easeProgress };
      } else {
        const startY = ctx.canvas.height + size;
        const endY = screenPos.y;
        screenPos = { x: screenPos.x, y: startY + (endY - startY) * easeProgress };
      }
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    if (base.isSelected) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
      ctx.restore();
    }

    ctx.globalAlpha = 0.3;
    ctx.fillRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
    ctx.globalAlpha = 1.0;
    ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);

    if (state.mode === 'game' && (!state.matchStartAnimation || state.matchStartAnimation.phase === 'go')) {
      const doorSize = size / 3;
      const playerPhotons = state.players[base.owner].photons;

      const doorPositions = [
        { x: screenPos.x, y: screenPos.y - size / 2, type: state.settings.unitSlots.up },
        { x: screenPos.x - size / 2, y: screenPos.y, type: state.settings.unitSlots.left },
        { x: screenPos.x, y: screenPos.y + size / 2, type: state.settings.unitSlots.down },
        { x: screenPos.x + size / 2, y: screenPos.y, type: state.settings.unitSlots.right },
      ];

      doorPositions.forEach((door) => {
        const def = UNIT_DEFINITIONS[door.type];

        const canAfford = playerPhotons >= def.cost;

        if (canAfford && !base.isSelected) {
          ctx.save();
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.globalAlpha = 0.8;

          if (door.y < screenPos.y) {
            ctx.fillRect(door.x - doorSize / 2, door.y, doorSize, 3);
          } else if (door.y > screenPos.y) {
            ctx.fillRect(door.x - doorSize / 2, door.y - 3, doorSize, 3);
          } else if (door.x < screenPos.x) {
            ctx.fillRect(door.x, door.y - doorSize / 2, 3, doorSize);
          } else if (door.x > screenPos.x) {
            ctx.fillRect(door.x - 3, door.y - doorSize / 2, 3, doorSize);
          }

          ctx.restore();
        }
      });

      if (base.movementTarget) {
        const targetScreen = positionToPixels(base.movementTarget);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(targetScreen.x, targetScreen.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      
      drawBaseHealthBar(ctx, base, screenPos, size, color, state);
    }
    
    // Draw laser beam if active
    if (base.laserBeam && Date.now() < base.laserBeam.endTime) {
      drawLaserBeam(ctx, base, screenPos, color);
    }
  });
}

function drawBaseHealthBar(ctx: CanvasRenderingContext2D, base: Base, screenPos: { x: number; y: number }, baseSize: number, color: string, state: GameState): void {
  const barWidth = baseSize * 1.2;
  const barHeight = 8;
  const barX = screenPos.x - barWidth / 2;
  const barY = screenPos.y - baseSize / 2 - 20;
  const hpPercent = base.hp / base.maxHp;
  
  ctx.save();
  
  ctx.fillStyle = 'oklch(0.20 0 0)';
  ctx.strokeStyle = 'oklch(0.45 0 0)';
  ctx.lineWidth = 1.5;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  
  const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * hpPercent, barY);
  
  if (hpPercent > 0.6) {
    gradient.addColorStop(0, 'oklch(0.70 0.20 140)');
    gradient.addColorStop(1, 'oklch(0.65 0.22 145)');
  } else if (hpPercent > 0.3) {
    gradient.addColorStop(0, 'oklch(0.85 0.20 95)');
    gradient.addColorStop(1, 'oklch(0.78 0.22 85)');
  } else {
    gradient.addColorStop(0, 'oklch(0.62 0.28 25)');
    gradient.addColorStop(1, 'oklch(0.58 0.26 20)');
  }
  
  ctx.fillStyle = gradient;
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  
  ctx.shadowColor = hpPercent > 0.6 ? 'oklch(0.70 0.20 140)' : hpPercent > 0.3 ? 'oklch(0.85 0.20 95)' : 'oklch(0.62 0.28 25)';
  ctx.shadowBlur = 8;
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  ctx.shadowBlur = 0;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  ctx.shadowBlur = 0;
  
  if (state.settings.showNumericHP) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 11px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'oklch(0 0 0)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.ceil(base.hp)} / ${base.maxHp}`, screenPos.x, barY + barHeight / 2);
    ctx.shadowBlur = 0;
  }
  
  ctx.restore();
}

function drawLaserBeam(ctx: CanvasRenderingContext2D, base: Base, screenPos: { x: number; y: number }, color: string): void {
  if (!base.laserBeam) return;
  
  const direction = base.laserBeam.direction;
  const laserEnd = add(base.position, scale(direction, LASER_RANGE));
  const endScreenPos = positionToPixels(laserEnd);
  
  // Calculate beam fade based on remaining time
  const timeLeft = base.laserBeam.endTime - Date.now();
  const alpha = Math.min(1, timeLeft / 200); // Fade in last 200ms
  
  ctx.save();
  ctx.globalAlpha = alpha;
  
  // Draw main beam
  ctx.strokeStyle = COLORS.laser;
  ctx.lineWidth = 4;
  ctx.shadowColor = COLORS.laser;
  ctx.shadowBlur = 20;
  
  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y);
  ctx.lineTo(endScreenPos.x, endScreenPos.y);
  ctx.stroke();
  
  // Draw bright core
  ctx.lineWidth = 2;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = 'oklch(0.95 0.25 320)';
  
  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y);
  ctx.lineTo(endScreenPos.x, endScreenPos.y);
  ctx.stroke();
  
  ctx.restore();
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.projectiles.forEach((projectile) => {
    const screenPos = positionToPixels(projectile.position);
    
    ctx.save();
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 10;
    
    // Draw projectile with glow
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw energy trail
    const trailLength = 8;
    const direction = normalize(projectile.velocity);
    const trailStart = subtract(projectile.position, scale(direction, trailLength / 20));
    const trailScreenPos = positionToPixels(trailStart);
    
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(trailScreenPos.x, trailScreenPos.y);
    ctx.lineTo(screenPos.x, screenPos.y);
    ctx.stroke();
    
    ctx.restore();
  });
}

function drawUnitHealthBar(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string, showNumeric: boolean): void {
  const barWidth = 24;
  const barHeight = 4;
  const barX = screenPos.x - barWidth / 2;
  const barY = screenPos.y - 18;
  const hpPercent = unit.hp / unit.maxHp;
  
  ctx.save();
  
  ctx.fillStyle = 'oklch(0.20 0 0)';
  ctx.strokeStyle = 'oklch(0.35 0 0)';
  ctx.lineWidth = 1;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  
  if (hpPercent > 0.6) {
    ctx.fillStyle = 'oklch(0.70 0.20 140)';
  } else if (hpPercent > 0.3) {
    ctx.fillStyle = 'oklch(0.85 0.20 95)';
  } else {
    ctx.fillStyle = 'oklch(0.62 0.28 25)';
  }
  
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  
  ctx.shadowColor = hpPercent > 0.6 ? 'oklch(0.70 0.20 140)' : hpPercent > 0.3 ? 'oklch(0.85 0.20 95)' : 'oklch(0.62 0.28 25)';
  ctx.shadowBlur = 4;
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  ctx.shadowBlur = 0;
  
  if (showNumeric) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 9px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'oklch(0 0 0)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.ceil(unit.hp)}`, screenPos.x, barY - 6);
    ctx.shadowBlur = 0;
  }
  
  ctx.restore();
}

function drawUnits(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.units.forEach((unit) => {
    const screenPos = positionToPixels(unit.position);
    const color = state.players[unit.owner].color;
    
    // Draw particles first (behind the unit)
    if (unit.particles && unit.particles.length > 0) {
      drawParticles(ctx, unit);
    }

    if (unit.cloaked) {
      ctx.globalAlpha = 0.3;
    }

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (unit.type === 'snaker') {
      drawSnaker(ctx, unit, screenPos, color);
    } else if (unit.type === 'tank') {
      drawTank(ctx, unit, screenPos, color);
    } else if (unit.type === 'scout') {
      drawScout(ctx, unit, screenPos, color);
    } else if (unit.type === 'artillery') {
      drawArtillery(ctx, unit, screenPos, color);
    } else if (unit.type === 'medic') {
      drawMedic(ctx, unit, screenPos, color);
    } else if (unit.type === 'interceptor') {
      drawInterceptor(ctx, unit, screenPos, color);
    } else {
      const radius = metersToPixels(UNIT_SIZE_METERS / 2);

      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (unit.type === 'warrior') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenPos.x - radius, screenPos.y - radius);
        ctx.lineTo(screenPos.x + radius, screenPos.y + radius);
        ctx.moveTo(screenPos.x + radius, screenPos.y - radius);
        ctx.lineTo(screenPos.x - radius, screenPos.y + radius);
        ctx.stroke();
      }
    }

    ctx.restore();

    if (unit.shieldActive) {
      drawShieldDome(ctx, unit, screenPos, color);
    }

    if (unit.healPulseActive) {
      drawHealPulse(ctx, unit, screenPos, color);
    }

    if (unit.missileBarrageActive) {
      drawMissileBarrage(ctx, unit, screenPos, color);
    }

    if (unit.bombardmentActive) {
      drawBombardment(ctx, unit, color, state);
    }
    
    if (unit.meleeAttackEffect) {
      drawMeleeAttack(ctx, unit, screenPos, color);
    }

    ctx.globalAlpha = 1.0;

    drawUnitHealthBar(ctx, unit, screenPos, color, state.settings.showNumericHP);

    ctx.fillStyle = COLORS.white;
    ctx.font = '10px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${unit.damageMultiplier.toFixed(1)}x`, screenPos.x, screenPos.y + 20);
  });
}

function drawParticles(ctx: CanvasRenderingContext2D, unit: Unit): void {
  if (!unit.particles || unit.particles.length === 0) return;
  
  unit.particles.forEach((particle) => {
    const screenPos = positionToPixels(particle.position);
    
    // Draw particle with glow effect
    ctx.save();
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    
    // Draw small circle for particle
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
}

function drawSnaker(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const segmentSize = 6;
  const segments = 5;

  for (let i = 0; i < segments; i++) {
    const offset = i * 8;
    const angle = (unit.distanceTraveled * 2 + i * 0.5) % (Math.PI * 2);
    const wobble = Math.sin(angle) * 3;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(screenPos.x - offset + wobble, screenPos.y - segmentSize);
    ctx.lineTo(screenPos.x - offset - segmentSize + wobble, screenPos.y);
    ctx.lineTo(screenPos.x - offset + wobble, screenPos.y + segmentSize);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTank(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const size = metersToPixels(UNIT_SIZE_METERS);

  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  ctx.fillRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
  ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
}

function drawScout(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2) * 0.7;

  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y - radius * 1.2);
  ctx.lineTo(screenPos.x + radius, screenPos.y + radius);
  ctx.lineTo(screenPos.x - radius, screenPos.y + radius);
  ctx.closePath();
  ctx.fill();
}

function drawArtillery(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2);

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;

  ctx.fillRect(screenPos.x - radius, screenPos.y - radius / 2, radius * 2, radius);

  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y);
  ctx.lineTo(screenPos.x + radius * 1.5, screenPos.y - radius);
  ctx.stroke();
}

function drawMedic(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2);

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.white;
  const crossSize = radius * 0.6;
  ctx.fillRect(screenPos.x - crossSize / 2, screenPos.y - crossSize / 6, crossSize, crossSize / 3);
  ctx.fillRect(screenPos.x - crossSize / 6, screenPos.y - crossSize / 2, crossSize / 3, crossSize);
}

function drawInterceptor(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2) * 0.8;

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y - radius * 1.4);
  ctx.lineTo(screenPos.x + radius * 0.6, screenPos.y);
  ctx.lineTo(screenPos.x, screenPos.y + radius);
  ctx.lineTo(screenPos.x - radius * 0.6, screenPos.y);
  ctx.closePath();
  ctx.fill();
}

function drawShieldDome(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  if (!unit.shieldActive) return;

  const radius = metersToPixels(unit.shieldActive.radius);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.4;
  ctx.setLineDash([5, 5]);

  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.1;
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

function drawHealPulse(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  if (!unit.healPulseActive) return;

  const progress = (Date.now() - (unit.healPulseActive.endTime - 1000)) / 1000;
  const radius = metersToPixels(unit.healPulseActive.radius * progress);

  ctx.save();
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.globalAlpha = Math.max(0, 1 - progress);

  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawMissileBarrage(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  if (!unit.missileBarrageActive) return;

  const progress = (Date.now() - (unit.missileBarrageActive.endTime - 1500)) / 1500;

  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  unit.missileBarrageActive.missiles.forEach((missile) => {
    const currentPos = {
      x: missile.position.x + (missile.target.x - missile.position.x) * progress,
      y: missile.position.y + (missile.target.y - missile.position.y) * progress,
    };
    const currentScreenPos = positionToPixels(currentPos);

    ctx.beginPath();
    ctx.arc(currentScreenPos.x, currentScreenPos.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawBombardment(ctx: CanvasRenderingContext2D, unit: Unit, color: string, state: GameState): void {
  if (!unit.bombardmentActive) return;

  const targetScreen = positionToPixels(unit.bombardmentActive.targetPos);
  const now = Date.now();

  if (now < unit.bombardmentActive.impactTime) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.6;

    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, metersToPixels(3), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  } else {
    const explosionProgress = (now - unit.bombardmentActive.impactTime) / (unit.bombardmentActive.endTime - unit.bombardmentActive.impactTime);
    const radius = metersToPixels(3 * (1 + explosionProgress * 0.5));

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.max(0, 0.6 - explosionProgress * 0.6);

    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawMeleeAttack(ctx: CanvasRenderingContext2D, unit: Unit, unitScreenPos: { x: number; y: number }, color: string): void {
  if (!unit.meleeAttackEffect) return;
  
  const now = Date.now();
  if (now > unit.meleeAttackEffect.endTime) {
    unit.meleeAttackEffect = undefined;
    return;
  }
  
  const targetScreenPos = positionToPixels(unit.meleeAttackEffect.targetPos);
  const progress = 1 - ((unit.meleeAttackEffect.endTime - now) / 200);
  
  ctx.save();
  
  // Draw slash effect - expanding line from unit to target
  ctx.strokeStyle = color;
  ctx.lineWidth = 4 - progress * 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.globalAlpha = 1 - progress;
  
  ctx.beginPath();
  ctx.moveTo(unitScreenPos.x, unitScreenPos.y);
  ctx.lineTo(targetScreenPos.x, targetScreenPos.y);
  ctx.stroke();
  
  // Draw impact burst at target
  ctx.fillStyle = color;
  const burstRadius = 5 + progress * 15;
  ctx.globalAlpha = (1 - progress) * 0.5;
  
  ctx.beginPath();
  ctx.arc(targetScreenPos.x, targetScreenPos.y, burstRadius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawSelectionIndicators(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.units.forEach((unit) => {
    if (!state.selectedUnits.has(unit.id)) return;

    const screenPos = positionToPixels(unit.position);
    const radius = metersToPixels(UNIT_SIZE_METERS / 2) + 4;
    const color = state.players[unit.owner].color;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
  });
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COLORS.white;
  ctx.font = '14px Space Grotesk, sans-serif';
  ctx.textAlign = 'left';

  const p1 = state.players[0];
  ctx.fillStyle = p1.color;
  ctx.fillText(`Photons: ${Math.floor(p1.photons)} (+${p1.incomeRate}/s)`, 10, 20);

  ctx.fillStyle = COLORS.white;
  ctx.fillText(`Time: ${Math.floor(state.elapsedTime)}s`, 10, 40);
  
  if (state.matchTimeLimit) {
    const timeRemaining = Math.max(0, state.matchTimeLimit - state.elapsedTime);
    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    if (timeRemaining <= 30) {
      ctx.fillStyle = 'oklch(0.62 0.28 25)';
    } else if (timeRemaining <= 60) {
      ctx.fillStyle = 'oklch(0.85 0.20 95)';
    } else {
      ctx.fillStyle = COLORS.white;
    }
    
    ctx.font = '18px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, ctx.canvas.width / 2, 30);
    ctx.textAlign = 'left';
    ctx.font = '14px Space Grotesk, sans-serif';
  }
}

function drawSelectionRect(ctx: CanvasRenderingContext2D, rect: { x1: number; y1: number; x2: number; y2: number }, state: GameState): void {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.globalAlpha = 0.8;
  
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
}

function drawVisualFeedback(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.visualFeedback || state.visualFeedback.length === 0) return;
  
  const now = Date.now();
  
  state.visualFeedback.forEach(feedback => {
    const elapsed = now - feedback.startTime;
    const progress = elapsed / 500; // 500ms fade out
    const alpha = Math.max(0, 1 - progress);
    
    if (feedback.type === 'tap') {
      const screenPos = positionToPixels(feedback.position);
      const radius = 10 + elapsed * 0.05;
      
      ctx.save();
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 3;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = COLORS.white;
      ctx.shadowBlur = 10;
      
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.restore();
    } else if (feedback.type === 'drag' && feedback.endPosition) {
      const startScreen = positionToPixels(feedback.position);
      const endScreen = positionToPixels(feedback.endPosition);
      
      ctx.save();
      ctx.strokeStyle = COLORS.telegraph;
      ctx.lineWidth = 4;
      ctx.globalAlpha = alpha * 0.6;
      ctx.shadowColor = COLORS.telegraph;
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(endScreen.x, endScreen.y);
      ctx.stroke();
      
      // Draw arrowhead
      const dx = endScreen.x - startScreen.x;
      const dy = endScreen.y - startScreen.y;
      const angle = Math.atan2(dy, dx);
      const arrowSize = 15;
      
      ctx.beginPath();
      ctx.moveTo(endScreen.x, endScreen.y);
      ctx.lineTo(
        endScreen.x - arrowSize * Math.cos(angle - Math.PI / 6),
        endScreen.y - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(endScreen.x, endScreen.y);
      ctx.lineTo(
        endScreen.x - arrowSize * Math.cos(angle + Math.PI / 6),
        endScreen.y - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      
      ctx.restore();
    }
  });
}
