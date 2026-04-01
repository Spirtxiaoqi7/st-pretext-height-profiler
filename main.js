// ==================== 1. Pretext 库加载 ====================
let prepare = null;
let layout = null;

async function loadPretext() {
    if (prepare && layout) return true;
    try {
        const pretext = await import('https://esm.sh/@chenglou/pretext');
        prepare = pretext.prepare;
        layout = pretext.layout;
        console.log('Pretext库已加载');
        return true;
    } catch (e) {
        console.error('Pretext加载失败', e);
        return false;
    }
}

// ==================== 2. 高度管理器（基于真实高度）====================
class HeightManager {
    constructor() {
        this.heights = [];
        this.prefixSums = [];
        this.totalHeight = 0;
    }

    reset() {
        this.heights = [];
        this.prefixSums = [];
        this.totalHeight = 0;
    }

    setHeights(heightsArray) {
        this.heights = [...heightsArray];
        this._rebuildPrefixSums();
    }

    _rebuildPrefixSums() {
        this.prefixSums = [];
        let sum = 0;
        for (let i = 0; i < this.heights.length; i++) {
            sum += this.heights[i];
            this.prefixSums.push(sum);
        }
        this.totalHeight = sum;
    }

    getTotalHeight() {
        return this.totalHeight;
    }

    getOffset(index) {
        if (index <= 0) return 0;
        return this.prefixSums[index - 1];
    }

    findIndex(scrollTop) {
        if (scrollTop <= 0) return 0;
        if (scrollTop >= this.totalHeight) return Math.max(0, this.heights.length - 1);
        let left = 0, right = this.prefixSums.length - 1;
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.prefixSums[mid] <= scrollTop) left = mid + 1;
            else right = mid;
        }
        return left;
    }
}

// ==================== 3. 全局变量 ====================
let heightManager = null;
let isVirtualEnabled = false;
let scrollManager = null;
let active = true;

// 性能统计（仅用于 Pretext 测量）
let totalPrepareTime = 0, totalLayoutTime = 0, processedMessages = 0;
let nativeScrollCount = 0, nativeScrollDuration = 0;
let virtualScrollCount = 0, virtualScrollDuration = 0;

const preparedCache = new Map();
const FONT = '16px "Segoe UI", "Noto Sans", system-ui, -apple-system, sans-serif';
const LINE_HEIGHT = 24;

// ==================== 4. Pretext 测量函数（仅用于统计）====================
function measureHeightWithPretext(text, containerWidth) {
    if (!prepare || !layout) return LINE_HEIGHT;
    if (!text) return LINE_HEIGHT;
    try {
        let prepared = preparedCache.get(text);
        let prepareTime = 0;
        if (!prepared) {
            const start = performance.now();
            prepared = prepare(text, FONT);
            prepareTime = performance.now() - start;
            preparedCache.set(text, prepared);
            totalPrepareTime += prepareTime;
        }
        const layoutStart = performance.now();
        const { height } = layout(prepared, containerWidth, LINE_HEIGHT);
        const layoutTime = performance.now() - layoutStart;
        totalLayoutTime += layoutTime;
        processedMessages++;
        updateStatsUI();
        return height;
    } catch (e) {
        console.error('Pretext测量失败', e);
        return LINE_HEIGHT;
    }
}

function updateStatsUI() {
    const msgCountSpan = document.getElementById('pretext_msg_count');
    const prepareTotalSpan = document.getElementById('pretext_prepare_total');
    const layoutTotalSpan = document.getElementById('pretext_layout_total');
    if (msgCountSpan) msgCountSpan.innerText = processedMessages;
    if (prepareTotalSpan) prepareTotalSpan.innerText = totalPrepareTime.toFixed(2);
    if (layoutTotalSpan) layoutTotalSpan.innerText = totalLayoutTime.toFixed(2);
}

function updateBenchmarkUI() {
    const nativeAvgSpan = document.getElementById('bench_native_avg');
    const virtualAvgSpan = document.getElementById('bench_virtual_avg');
    const nativeCountSpan = document.getElementById('bench_native_count');
    const virtualCountSpan = document.getElementById('bench_virtual_count');

    if (nativeAvgSpan) {
        const nativeAvg = nativeScrollCount > 0 ? (nativeScrollDuration / nativeScrollCount).toFixed(2) : '0';
        nativeAvgSpan.innerText = nativeAvg;
    }
    if (virtualAvgSpan) {
        const virtualAvg = virtualScrollCount > 0 ? (virtualScrollDuration / virtualScrollCount).toFixed(2) : '0';
        virtualAvgSpan.innerText = virtualAvg;
    }
    if (nativeCountSpan) nativeCountSpan.innerText = nativeScrollCount;
    if (virtualCountSpan) virtualCountSpan.innerText = virtualScrollCount;
}

function resetStats() {
    totalPrepareTime = 0; totalLayoutTime = 0; processedMessages = 0;
    nativeScrollCount = 0; nativeScrollDuration = 0;
    virtualScrollCount = 0; virtualScrollDuration = 0;
    preparedCache.clear();
    updateStatsUI();
    updateBenchmarkUI();
    console.log('所有统计已重置');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== 5. 原生滚动监控（修复时长统计）====================
function attachNativeScrollMonitor() {
    const container = document.getElementById('chat');
    if (!container) return;
    let measuring = false;
    container.addEventListener('scroll', function() {
        // 只在原生渲染模式下记录
        if (isVirtualEnabled) return;
        if (measuring) return;
        measuring = true;
        const start = performance.now();
        requestAnimationFrame(function() {
            const duration = performance.now() - start;
            nativeScrollCount++;
            nativeScrollDuration += duration;
            updateBenchmarkUI();
            measuring = false;
        });
    });
}

// ==================== 6. 虚拟滚动管理器（内部轨道模式，不影响外部布局）====================
class VirtualScrollManager {
    constructor(container, heightManager) {
        this.container = container;
        this.heightManager = heightManager;
        this.nodePool = [];
        this.overscan = 4;
        this.currentStartIndex = 0;
        this.currentEndIndex = -1;
        this.isActive = false;
        this.originalContent = null;
        this.track = null;
        this.resizeObserver = null;
        this.scrollMeasureStart = null;
        this.renderedIndexes = [];
        this.messageNodeCache = [];
        this._scrollHandler = this._onScroll.bind(this);
    }

    _captureRealHeights() {
        const nodes = Array.from(this.container.querySelectorAll('.mes'));
        return nodes.map(node => node.getBoundingClientRect().height);
    }

    _cacheMessageNodes() {
        const nodes = Array.from(this.container.querySelectorAll('.mes'));
        this.messageNodeCache = nodes.map(node => node.cloneNode(true));
    }

    _calculatePoolSize() {
        const viewportHeight = this.container.clientHeight || 0;
        let avgHeight = LINE_HEIGHT;
        if (this.heightManager.heights.length > 0) {
            avgHeight = this.heightManager.getTotalHeight() / this.heightManager.heights.length;
        }
        const visible = Math.ceil(viewportHeight / avgHeight);
        return Math.min(this.heightManager.heights.length, Math.max(12, visible + this.overscan * 2));
    }

    _ensurePoolSize(size) {
        while (this.nodePool.length < size) {
            const node = document.createElement('div');
            node.className = 'virtual-item';
            node.style.position = 'absolute';
            node.style.left = '0';
            node.style.width = '100%';
            node.style.boxSizing = 'border-box';
            node.style.willChange = 'transform';
            node.style.display = 'none';
            this.track.appendChild(node);
            this.nodePool.push(node);
            this.renderedIndexes.push(-1);
        }
    }

    activate() {
        if (this.isActive) return;

        this.originalContent = this.container.innerHTML;
        this._cacheMessageNodes();

        const realHeights = this._captureRealHeights();
        this.heightManager.setHeights(realHeights);

        this.container.innerHTML = '';
        this.track = document.createElement('div');
        this.track.className = 'virtual-track';
        this.track.style.position = 'relative';
        this.track.style.height = this.heightManager.getTotalHeight() + 'px';
        this.track.style.width = '100%';
        this.container.appendChild(this.track);

        this.poolSize = this._calculatePoolSize();
        this._ensurePoolSize(this.poolSize);

        this.container.style.overflowY = 'auto';
        this.container.addEventListener('scroll', this._scrollHandler);

        this.resizeObserver = new ResizeObserver(() => this.refresh());
        this.resizeObserver.observe(this.container);

        this.isActive = true;
        this._updateVisibleRange();
        console.log('虚拟滚动已激活（内部轨道模式）');
    }

    deactivate() {
        if (!this.isActive) return;
        this.container.removeEventListener('scroll', this._scrollHandler);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.container.innerHTML = this.originalContent;
        this.container.style.overflowY = '';
        this.isActive = false;
        this.nodePool = [];
        this.renderedIndexes = [];
        this.messageNodeCache = [];
        this.track = null;
        console.log('虚拟滚动已停用');
    }

    refresh() {
        if (!this.isActive) return;
        const realHeights = this._captureRealHeights();
        this.heightManager.setHeights(realHeights);
        if (this.track) this.track.style.height = this.heightManager.getTotalHeight() + 'px';
        this._cacheMessageNodes();
        this.currentStartIndex = -1;
        this.currentEndIndex = -1;
        this._updateVisibleRange();
    }

    _onScroll() {
        if (this.scrollMeasureStart === null) {
            this.scrollMeasureStart = performance.now();
        }
        requestAnimationFrame(() => {
            if (this.scrollMeasureStart) {
                const duration = performance.now() - this.scrollMeasureStart;
                virtualScrollCount++;
                virtualScrollDuration += duration;
                updateBenchmarkUI();
                this.scrollMeasureStart = null;
            }
            this._updateVisibleRange();
        });
    }

    _updateVisibleRange() {
        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;

        let startIndex = this.heightManager.findIndex(Math.max(0, scrollTop - this.overscan * LINE_HEIGHT));
        let endIndex = startIndex;
        let accumulatedHeight = this.heightManager.getOffset(startIndex);
        const targetBottom = scrollTop + containerHeight + this.overscan * LINE_HEIGHT;

        while (endIndex < this.heightManager.heights.length - 1 && accumulatedHeight < targetBottom) {
            accumulatedHeight += this.heightManager.heights[endIndex];
            endIndex++;
        }

        if (this.currentStartIndex === startIndex && this.currentEndIndex === endIndex) return;
        this.currentStartIndex = startIndex;
        this.currentEndIndex = endIndex;
        this._renderRange(startIndex, endIndex);
    }

    _renderRange(startIndex, endIndex) {
        const visibleCount = endIndex - startIndex + 1;
        this._ensurePoolSize(visibleCount);

        for (let i = 0; i < this.nodePool.length; i++) {
            this.nodePool[i].style.display = 'none';
        }

        for (let j = 0; j < visibleCount; j++) {
            const idx = startIndex + j;
            if (idx >= this.messageNodeCache.length) break;

            const height = this.heightManager.heights[idx];
            const top = this.heightManager.getOffset(idx);
            const node = this.nodePool[j];

            node.style.display = 'block';
            node.style.transform = `translateY(${top}px)`;
            node.style.height = height + 'px';

            if (this.renderedIndexes[j] !== idx) {
                node.innerHTML = '';
                const sourceNode = this.messageNodeCache[idx];
                if (sourceNode) {
                    node.appendChild(sourceNode.cloneNode(true));
                } else {
                    const context = SillyTavern.getContext();
                    const chat = context.chat;
                    const text = (chat && chat[idx]) ? (chat[idx].mes || chat[idx].text || '') : '';
                    node.innerHTML = `<div class="mes"><div class="mes_text">${escapeHtml(text)}</div></div>`;
                }
                this.renderedIndexes[j] = idx;
            }
            node.setAttribute('data-index', idx);
        }

        for (let k = visibleCount; k < this.renderedIndexes.length; k++) {
            this.renderedIndexes[k] = -1;
        }
    }
}

// ==================== 7. 启用/禁用虚拟滚动 ====================
async function enableVirtualScroll() {
    if (isVirtualEnabled) return;
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    if (!heightManager) heightManager = new HeightManager();

    scrollManager = new VirtualScrollManager(chatContainer, heightManager);
    scrollManager.activate();
    isVirtualEnabled = true;

    const statusSpan = document.getElementById('virtual_status');
    if (statusSpan) statusSpan.innerText = '已启用';
    console.log('虚拟滚动已启用');
}

function disableVirtualScroll() {
    if (!isVirtualEnabled) return;
    if (scrollManager) scrollManager.deactivate();
    isVirtualEnabled = false;

    const statusSpan = document.getElementById('virtual_status');
    if (statusSpan) statusSpan.innerText = '已禁用';
    console.log('虚拟滚动已禁用');
}

// ==================== 8. 高度重建（仅用于统计）====================
async function rebuildHeightsForStats() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;
    const container = document.getElementById('chat');
    const containerWidth = container ? container.clientWidth - 40 : 500;
    for (let i = 0; i < chat.length; i++) {
        const text = chat[i].mes || chat[i].text || '';
        measureHeightWithPretext(text, containerWidth);
    }
}

// ==================== 9. 事件监听 ====================
function attachEventListeners(eventSource, event_types) {
    if (!eventSource || !event_types) return;
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        setTimeout(() => {
            if (isVirtualEnabled && scrollManager) scrollManager.refresh();
            rebuildHeightsForStats();
        }, 200);
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            if (isVirtualEnabled && scrollManager) scrollManager.refresh();
            rebuildHeightsForStats();
        }, 500);
    });
    eventSource.on(event_types.MESSAGE_EDITED, () => {
        setTimeout(() => {
            if (isVirtualEnabled && scrollManager) scrollManager.refresh();
            rebuildHeightsForStats();
        }, 100);
    });
}

// ==================== 10. 插件主入口 ====================
(function() {
    const interval = setInterval(function() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            clearInterval(interval);
            initPlugin();
        }
    }, 100);

    async function initPlugin() {
        await loadPretext();

        const context = SillyTavern.getContext();
        const eventSource = context.eventSource;
        const event_types = context.event_types;

        heightManager = new HeightManager();

        const settingsHtml = `
            <details open id="pretext_profiler_settings_wrapper" style="margin-bottom: 20px;">
                <summary style="cursor: pointer; font-weight: bold; user-select: none;">
                    <h3 style="display: inline-block; margin: 0;">Pretext 高度分析器 + 虚拟滚动 (v1.2.1)</h3>
                </summary>
                <div id="pretext_profiler_settings" style="margin-top: 10px;">
                    <div style="background: #2a2a2a; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                        <label style="margin-right: 20px;">
                            <input type="checkbox" id="pretext_profiler_enable" checked> 启用测量
                        </label>
                        <label>
                            <input type="checkbox" id="virtual_scroll_enable"> 启用虚拟滚动
                            <span id="virtual_status" style="margin-left: 8px; font-size: 12px; color: #888;">已禁用</span>
                        </label>
                    </div>
                    <div style="background: #1e1e1e; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #4caf50;">
                        <strong>AB 性能对比</strong>
                        <div style="display: flex; gap: 30px; margin-top: 10px; font-size: 13px;">
                            <div style="flex: 1;">
                                <div style="color: #ff9800;">原生渲染模式</div>
                                <div>滚动次数: <span id="bench_native_count">0</span></div>
                                <div>平均耗时: <span id="bench_native_avg">0</span> ms/帧</div>
                            </div>
                            <div style="flex: 1;">
                                <div style="color: #4caf50;">Pretext 虚拟滚动</div>
                                <div>滚动次数: <span id="bench_virtual_count">0</span></div>
                                <div>平均耗时: <span id="bench_virtual_avg">0</span> ms/帧</div>
                            </div>
                        </div>
                    </div>
                    <div id="pretext_profiler_stats" style="margin-top: 10px; font-size: 12px; background: #2a2a2a; padding: 8px; border-radius: 6px;">
                        <strong>Pretext 测量统计</strong><br>
                        处理消息数: <span id="pretext_msg_count">0</span><br>
                        总 prepare 耗时: <span id="pretext_prepare_total">0</span> ms<br>
                        总 layout 耗时: <span id="pretext_layout_total">0</span> ms
                    </div>
                    <button id="pretext_profiler_reset" style="margin-top: 8px;">重置所有统计</button>
                </div>
            </details>
        `;

        const settingsContainer = document.getElementById('extensions_settings');
        if (settingsContainer) {
            settingsContainer.insertAdjacentHTML('beforeend', settingsHtml);
        }

        const enableCheckbox = document.getElementById('pretext_profiler_enable');
        const virtualEnableCheckbox = document.getElementById('virtual_scroll_enable');
        const resetBtn = document.getElementById('pretext_profiler_reset');

        if (enableCheckbox) {
            enableCheckbox.addEventListener('change', (e) => { active = e.target.checked; });
        }
        if (virtualEnableCheckbox) {
            virtualEnableCheckbox.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    await enableVirtualScroll();
                } else {
                    disableVirtualScroll();
                }
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', resetStats);
        }

        attachEventListeners(eventSource, event_types);
        attachNativeScrollMonitor();

        setTimeout(() => {
            rebuildHeightsForStats();
            console.log('Pretext Height Profiler v1.2.3 已加载');
        }, 1000);
    }
})();