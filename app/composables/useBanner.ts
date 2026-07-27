/**
 * useBanner — Banner 视差引擎（纯函数 + 状态管理）
 */
import type { BannerDataSet, BannerLayerData } from '../types'

// ===== 纯函数 =====

export function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end
}

export function calcCompensate(windowWidth: number, baseWidth = 1650): number {
  return windowWidth > baseWidth ? windowWidth / baseWidth : 1
}

/**
 * 3×3 仿射矩阵乘法：C = A × B
 * 矩阵格式对应 CSS matrix(a, b, c, d, tx, ty)，即：
 *   | a  c  tx |
 *   | b  d  ty |
 *   | 0  0  1  |
 */
function matMul(
  a1: number, b1: number, c1: number, d1: number, tx1: number, ty1: number,
  a2: number, b2: number, c2: number, d2: number, tx2: number, ty2: number,
) {
  return {
    a: a1 * a2 + c1 * b2,
    b: b1 * a2 + d1 * b2,
    c: a1 * c2 + c1 * d2,
    d: b1 * c2 + d1 * d2,
    tx: a1 * tx2 + c1 * ty2 + tx1,
    ty: b1 * tx2 + d1 * ty2 + ty1,
  }
}

export function calcLayerTransform(
  layer: BannerLayerData, moveX: number, windowWidth: number, progress?: number,
): { transform: string; opacity?: number } {
  const item = layer
  const isHoming = typeof progress === 'number'
  const [a, b, c, d, tx, ty] = item.transform

  let move = moveX * item.a
  let s = item.f ? item.f * moveX + 1 : 1
  let g = moveX * (item.g || 0)

  // m = O（原始 transform），复刻 HTML: new DOMMatrix(item.transform)
  let ma = a, mb = b, mc = c, md = d, mtx = tx, mty = ty

  if (isHoming) {
    // HTML: m.e = lerp(moveX * item.a + item.transform[4], item.transform[4], progress)
    mtx = lerp(moveX * item.a + tx, tx, progress!)
    move = 0
    s = lerp(item.f ? item.f * moveX + 1 : 1, 1, progress!)
    g = lerp(item.g ? item.g * moveX : 0, 0, progress!)
  }

  // Step 1: m = ST × O，复刻 HTML: m.multiply(new DOMMatrix([m.a*s, m.b, m.c, m.d*s, move, g]))
  // DOMMatrix.multiply(other) = other × self
  const st = matMul(
    ma * s, mb, mc, md * s, move, g,  // ST
    ma, mb, mc, md, mtx, mty,         // O（homing 时 tx 可能已被 lerp 修改）
  )
  ma = st.a; mb = st.b; mc = st.c; md = st.d; mtx = st.tx; mty = st.ty

  // Step 2: m = R × m，复刻 HTML: m.multiply(new DOMMatrix([cos, sin, -sin, cos, 0, 0]))
  if (item.deg) {
    const deg = isHoming ? lerp(item.deg * moveX, 0, progress!) : item.deg * moveX
    const cos = Math.cos(deg), sin = Math.sin(deg)
    const r = matMul(
      cos, sin, -sin, cos, 0, 0,  // R（旋转矩阵）
      ma, mb, mc, md, mtx, mty,   // 当前 m
    )
    ma = r.a; mb = r.b; mc = r.c; md = r.d; mtx = r.tx; mty = r.ty
  }

  let opacity: number | undefined
  if (item.opacity) {
    if (isHoming && moveX > 0) opacity = lerp(item.opacity[1], item.opacity[0], progress!)
    else opacity = lerp(item.opacity[0], item.opacity[1], (moveX / windowWidth) * 2)
  }

  return { transform: `matrix(${ma},${mb},${mc},${md},${mtx},${mty})`, opacity }
}

// ===== Composable =====

export function useBanner(initialBanners?: BannerDataSet[]) {
  const banners = ref<BannerDataSet[]>(initialBanners ?? [])
  const currentIndex = ref(0)
  const compensate = ref(1)
  const moveX = ref(0)
  const initX = ref(0)

  const currentBanner = computed(() => banners.value[currentIndex.value] ?? null)

  const layers = computed<BannerLayerData[]>(() => {
    if (!currentBanner.value) return []
    const c = compensate.value
    return currentBanner.value.data.map((layer) => ({
      ...layer,
      transform: [layer.transform[0], layer.transform[1], layer.transform[2], layer.transform[3], layer.transform[4] * c, layer.transform[5] * c],
      width: layer.width * c,
      height: layer.height ? layer.height * c : undefined,
    }))
  })

  function updateCompensate() {
    if (typeof window !== 'undefined') compensate.value = calcCompensate(window.innerWidth)
  }

  function randomizeIndex() {
    if (banners.value.length > 0) {
      currentIndex.value = Math.floor(Math.random() * banners.value.length)
    }
  }

  function getLayerStyles(layers: BannerLayerData[], mx: number, progress?: number) {
    const ww = typeof window !== 'undefined' ? window.innerWidth : 1650
    return layers.map((l) => calcLayerTransform(l, mx, ww, progress))
  }

  if (typeof window !== 'undefined') {
    updateCompensate()
    randomizeIndex()
  }

  return { banners, currentIndex, currentBanner, layers, compensate, moveX, initX, updateCompensate, getLayerStyles }
}
