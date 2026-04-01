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

// ==================== 2. 高度管理器 ====================
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
            if (this.prefixSums[mid] <= scrollTop) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        return left;
    }
}

// ==================== 3. 全局变量 ====================
let heightManager = null;
let isVirtualEnabled = false;
let scrollManager = null;
let active = true;
let originalChatContent = null;

// 性能统计
let totalPrepareTime = 0;
let totalLayoutTime = 0;
let processedMessages = 0;
let nativeScrollCount = 0;
let nativeScrollDuration = 0;
let virtualScrollCount = 0;
let virtualScrollDuration = 0;

const preparedCache = new Map();
const FONT = '16px "Segoe UI", "Noto Sans", system-ui, -apple-system, sans-serif';
const LINE_HEIGHT = 24;

// ==================== 4. 测量函数 ====================
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
    const improvementSpan = document.getElementById('bench_improvement');
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

    if (improvementSpan) {
        const nativeAvg = nativeScrollCount > 0 ? nativeScrollDuration / nativeScrollCount : 0;
        const virtualAvg = virtualScrollCount > 0 ? virtualScrollDuration / virtualScrollCount : 0;
        if (nativeAvg > 0 && virtualAvg > 0) {
            const percent = ((nativeAvg - virtualAvg) / nativeAvg * 100).toFixed(1);
            improvementSpan.innerText = percent + '%';
            improvementSpan.style.color = parseFloat(percent) > 0 ? '#4caf50' : '#ff9800';
        } else {
            improvementSpan.innerText = '--';
        }
    }
}

function resetStats() {
    totalPrepareTime = 0;
    totalLayoutTime = 0;
    processedMessages = 0;
    nativeScrollCount = 0;
    nativeScrollDuration = 0;
    virtualScrollCount = 0;
    virtualScrollDuration = 0;
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

// ==================== 5. 原生滚动性能监控 ====================
function attachNativeScrollMonitor() {
    const container = document.getElementById('chat');
    if (!container) return;
    let measuring = false;
    container.addEventListener('scroll', function() {
        if (!active || isVirtualEnabled) return;
        if (measuring) return;
        measuring = true;
        var start = performance.now();
        requestAnimationFrame(function() {
            var duration = performance.now() - start;
            nativeScrollCount++;
            nativeScrollDuration += duration;
            updateBenchmarkUI();
            measuring = false;
        });
    });
}

// ==================== 6. 虚拟滚动管理器 ====================
class VirtualScrollManager {
    constructor(container, heightManager) {
        this.container = container;
        this.heightManager = heightManager;
        this.nodePool = [];
        this.poolSize = 0;
        this.overscan = 4;
        this.currentStartIndex = 0;
        this.currentEndIndex = -1;
        this.isActive = false;
        this.originalContent = null;
        this.track = null;
        this.resizeObserver = null;
        this.scrollMeasureStart = null;
        this.renderedSourceIndexes = [];
        this.messageNodeCache = [];
        this._scrollHandler = this._onScroll.bind(this);
    }

    _calculatePoolSize() {
        var viewportHeight = this.container.clientHeight || 0;
        var avgHeight = LINE_HEIGHT;
        if (this.heightManager.heights.length > 0) {
            avgHeight = Math.max(LINE_HEIGHT, this.heightManager.getTotalHeight() / this.heightManager.heights.length);
        }
        var visible = Math.ceil(viewportHeight / avgHeight);
        return Math.min(this.heightManager.heights.length, Math.max(12, visible + this.overscan * 2));
    }

    _ensurePoolSize(size) {
        while (this.nodePool.length < size) {
            var node = document.createElement('div');
            node.className = 'virtual-item';
            node.style.position = 'absolute';
            node.style.left = '0';
            node.style.width = '100%';
            node.style.boxSizing = 'border-box';
            node.style.willChange = 'transform';
            node.style.display = 'none';
            this.track.appendChild(node);
            this.nodePool.push(node);
            this.renderedSourceIndexes.push(-1);
        }
    }

    activate() {
        if (this.isActive) return;
        this.originalContent = this.container.innerHTML;
        this.messageNodeCache = Array.from(this.container.querySelectorAll('.mes')).map(function(node) {
            return node.cloneNode(true);
        });
        this.container.innerHTML = '';

        this.track = document.createElement('div');
        this.track.style.position = 'relative';
        this.track.style.height = this.heightManager.getTotalHeight() + 'px';
        this.track.style.width = '100%';
        this.container.appendChild(this.track);

        this.poolSize = this._calculatePoolSize();
        this._ensurePoolSize(this.poolSize);

        this.container.style.position = 'relative';
        this.container.style.overflowY = 'auto';
        this.container.addEventListener('scroll', this._scrollHandler);
        this.resizeObserver = new ResizeObserver(function() {
            if (this && this.refresh) this.refresh();
        }.bind(this));
        this.resizeObserver.observe(this.container);
        this.isActive = true;
        this._updateVisibleRange();
    }

    deactivate() {
        if (!this.isActive) return;
        this.container.removeEventListener('scroll', this._scrollHandler);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.container.innerHTML = this.originalContent;
        this.container.style.position = '';
        this.isActive = false;
        this.nodePool = [];
        this.renderedSourceIndexes = [];
        this.messageNodeCache = [];
        this.track = null;
    }

    refresh() {
        if (!this.isActive) return;
        if (this.track) {
            this.track.style.height = this.heightManager.getTotalHeight() + 'px';
        }
        this._ensurePoolSize(this._calculatePoolSize());
        this.currentStartIndex = -1;
        this.currentEndIndex = -1;
        this._updateVisibleRange();
    }

    _onScroll() {
        if (this.scrollMeasureStart === null) {
            this.scrollMeasureStart = performance.now();
        }
        requestAnimationFrame(function() {
            if (this.scrollMeasureStart !== null) {
                var duration = performance.now() - this.scrollMeasureStart;
                virtualScrollCount++;
                virtualScrollDuration += duration;
                updateBenchmarkUI();
                this.scrollMeasureStart = null;
            }
            this._updateVisibleRange();
        }.bind(this));
    }

    _updateVisibleRange() {
        var scrollTop = this.container.scrollTop;
        var containerHeight = this.container.clientHeight;
        var startIndex = this.heightManager.findIndex(Math.max(0, scrollTop - this.overscan * LINE_HEIGHT));
        var endIndex = startIndex;
        var accumulatedHeight = this.heightManager.getOffset(startIndex);
        var targetBottom = scrollTop + containerHeight + this.overscan * LINE_HEIGHT;
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
        var context = SillyTavern.getContext();
        var chat = context.chat;
        if (!chat) return;
        var visibleCount = endIndex - startIndex + 1;

        this._ensurePoolSize(visibleCount);

        for (var i = 0; i < this.nodePool.length; i++) {
            this.nodePool[i].style.display = 'none';
        }

        for (var j = 0; j < visibleCount; j++) {
            var idx = startIndex + j;
            if (idx >= chat.length) break;
            var message = chat[idx];
            var height = this.heightManager.heights[idx];
            var top = this.heightManager.getOffset(idx);
            var node = this.nodePool[j];
            node.style.display = 'block';
            node.style.transform = 'translateY(' + top + 'px)';
            node.style.height = height + 'px';
            if (this.renderedSourceIndexes[j] !== idx) {
                node.innerHTML = '';
                var sourceNode = this.messageNodeCache[idx];
                if (sourceNode) {
                    node.appendChild(sourceNode.cloneNode(true));
                } else {
                    var text = message.mes || message.text || '';
                    node.innerHTML = '<div class="mes"><div class="mes_text" style="white-space: pre-wrap;">' + escapeHtml(text) + '</div></div>';
                }
                this.renderedSourceIndexes[j] = idx;
            }
            node.setAttribute('data-mes-id', message.id || idx);
            node.setAttribute('data-index', idx);
            node.setAttribute('data-is-user', message.is_user);
        }

        for (var k = visibleCount; k < this.renderedSourceIndexes.length; k++) {
            this.renderedSourceIndexes[k] = -1;
        }
    }
}

// ==================== 7. 启用/禁用虚拟滚动 ====================
async function enableVirtualScroll() {
    if (isVirtualEnabled) return;
    var chatContainer = document.getElementById('chat');
    if (!chatContainer) return;
    if (!heightManager || heightManager.heights.length === 0) {
        await rebuildHeightsFromChatData();
    }
    scrollManager = new VirtualScrollManager(chatContainer, heightManager);
    scrollManager.activate();
    isVirtualEnabled = true;
    var statusSpan = document.getElementById('virtual_status');
    if (statusSpan) statusSpan.innerText = '已启用';
    console.log('虚拟滚动已启用');
}

function disableVirtualScroll() {
    if (!isVirtualEnabled) return;
    if (scrollManager) scrollManager.deactivate();
    isVirtualEnabled = false;
    var statusSpan = document.getElementById('virtual_status');
    if (statusSpan) statusSpan.innerText = '已禁用';
    console.log('虚拟滚动已禁用');
}

// ==================== 8. 高度重建 ====================
async function rebuildHeightsFromChatData() {
    var context = SillyTavern.getContext();
    var chat = context.chat;
    if (!chat || chat.length === 0) return;
    var container = document.getElementById('chat');
    var containerWidth = container ? container.clientWidth - 40 : 500;
    var newHeights = [];
    for (var i = 0; i < chat.length; i++) {
        var text = chat[i].mes || chat[i].text || '';
        var height = measureHeightWithPretext(text, containerWidth);
        newHeights.push(height);
    }
    if (heightManager) heightManager.setHeights(newHeights);
    if (isVirtualEnabled && scrollManager) scrollManager.refresh();
}

// ==================== 9. 性能测试 ====================
async function runBenchmark() {
    if (!heightManager || heightManager.heights.length === 0) {
        alert('请先加载聊天数据');
        return;
    }
    var container = document.getElementById('chat');
    if (!container) return;

    if (isVirtualEnabled) {
        disableVirtualScroll();
        await new Promise(function(r) { setTimeout(r, 500); });
    }

    console.log('开始原生模式性能测试...');
    for (var i = 0; i < 10; i++) {
        var randomPos = Math.random() * container.scrollHeight;
        container.scrollTop = randomPos;
        await new Promise(function(r) { setTimeout(r, 100); });
    }

    await enableVirtualScroll();
    await new Promise(function(r) { setTimeout(r, 500); });

    console.log('开始虚拟滚动模式性能测试...');
    for (var j = 0; j < 10; j++) {
        var randomPos2 = Math.random() * container.scrollHeight;
        container.scrollTop = randomPos2;
        await new Promise(function(r) { setTimeout(r, 100); });
    }

    var nativeAvg = nativeScrollCount > 0 ? (nativeScrollDuration / nativeScrollCount).toFixed(2) : '0';
    var virtualAvg = virtualScrollCount > 0 ? (virtualScrollDuration / virtualScrollCount).toFixed(2) : '0';
    alert('性能测试完成\n原生模式平均耗时: ' + nativeAvg + ' ms\n虚拟滚动平均耗时: ' + virtualAvg + ' ms');
}

// ==================== 10. 事件监听 ====================
function attachEventListeners(eventSource, event_types) {
    if (!eventSource || !event_types) return;
    eventSource.on(event_types.MESSAGE_RECEIVED, function() {
        setTimeout(function() { rebuildHeightsFromChatData(); }, 200);
    });
    eventSource.on(event_types.CHAT_CHANGED, function() {
        setTimeout(function() { rebuildHeightsFromChatData(); }, 500);
    });
}

// ==================== 11. 插件主入口 ====================
(function() {
    var interval = setInterval(function() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            clearInterval(interval);
            initPlugin();
        }
    }, 100);

    async function initPlugin() {
        await loadPretext();

        var context = SillyTavern.getContext();
        var eventSource = context.eventSource;
        var event_types = context.event_types;

        heightManager = new HeightManager();

        var settingsHtml = `
            <div id="pretext_profiler_settings" style="margin-bottom: 20px;">
                <h3>Pretext 高度分析器 + 虚拟滚动</h3>
                <div style="background: #2a2a2a; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                    <label style="margin-right: 20px;">
                        <input type="checkbox" id="pretext_profiler_enable" checked> 启用测量
                    </label>
                    <label>
                        <input type="checkbox" id="virtual_scroll_enable"> 启用虚拟滚动
                        <span id="virtual_status" style="margin-left: 8px; font-size: 12px; color: #888;">已禁用</span>
                    </label>
                    <button id="benchmark_run" style="margin-left: 20px; padding: 2px 12px;">运行性能测试</button>
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
                        <div style="flex: 1; text-align: center;">
                            <div style="color: #2196f3;">性能提升</div>
                            <div style="font-size: 24px; font-weight: bold;" id="bench_improvement">--</div>
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
                <hr style="margin: 12px 0;">
                <div>
                    <strong>测试工具</strong><br>
                    <textarea id="pretext_test_text" rows="2" placeholder="输入一些文字测试 Pretext 测量..." style="width: 100%; margin: 5px 0;"></textarea>
                    <button id="pretext_test_measure">测量高度</button>
                    <div id="pretext_test_result" style="margin-top: 5px; font-size: 12px;"></div>
                </div>
            </div>
        `;

        var settingsContainer = document.getElementById('extensions_settings');
        if (settingsContainer) {
            settingsContainer.insertAdjacentHTML('beforeend', settingsHtml);
        }

        var enableCheckbox = document.getElementById('pretext_profiler_enable');
        var virtualEnableCheckbox = document.getElementById('virtual_scroll_enable');
        var resetBtn = document.getElementById('pretext_profiler_reset');
        var benchmarkBtn = document.getElementById('benchmark_run');
        var testTextarea = document.getElementById('pretext_test_text');
        var testMeasureBtn = document.getElementById('pretext_test_measure');
        var testResultDiv = document.getElementById('pretext_test_result');

        if (enableCheckbox) {
            enableCheckbox.addEventListener('change', function(e) {
                active = e.target.checked;
            });
        }

        if (virtualEnableCheckbox) {
            virtualEnableCheckbox.addEventListener('change', async function(e) {
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

        if (benchmarkBtn) {
            benchmarkBtn.addEventListener('click', runBenchmark);
        }

        if (testMeasureBtn && testTextarea && testResultDiv) {
            testMeasureBtn.addEventListener('click', function() {
                var testText = testTextarea.value;
                if (!testText.trim()) {
                    testResultDiv.innerHTML = '<span style="color: red;">请输入文本</span>';
                    return;
                }
                var container = document.getElementById('chat');
                var width = container ? container.clientWidth - 40 : 400;
                var height = measureHeightWithPretext(testText, width);
                var lineCount = Math.ceil(height / LINE_HEIGHT);
                testResultDiv.innerHTML = '文本长度: ' + testText.length + ' 字符 | 预估高度: ' + height.toFixed(2) + ' px | 行数: ' + lineCount;
            });
        }

        attachEventListeners(eventSource, event_types);
        attachNativeScrollMonitor();

        setTimeout(function() {
            rebuildHeightsFromChatData();
            console.log('Pretext Height Profiler 已加载');
        }, 1000);
    }
})();
