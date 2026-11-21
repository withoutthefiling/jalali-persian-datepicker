/* Jalali Persian Datepicker — dependency-free and usable as a browser script or local package. */
(function (create) {
    if (typeof module === 'object' && module.exports) {
        module.exports = create();
        return;
    }
    if (globalThis.JalaliPersianDatepicker) return;
    const calendar = globalThis.JalaliPersianDatepicker = create();
    if (typeof document === 'undefined') return;
    const initialize = () => calendar.mountAll();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})(function () {
    'use strict';

    const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
        'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
    const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
    const digits = '۰۱۲۳۴۵۶۷۸۹';
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const dayMs = 86400000;
    const firstYear = 1000;
    const lastYear = 1999;
    const mounted = new WeakMap();
    let active = null;
    let sequence = 0;

    const latin = value => String(value ?? '').trim()
        .replace(/[۰-۹]/g, digit => digits.indexOf(digit))
        .replace(/[٠-٩]/g, digit => arabic.indexOf(digit));
    const persian = value => String(value).replace(/\d/g, digit => digits[Number(digit)]);
    const pad = value => String(value).padStart(2, '0');
    const iso = time => new Date(time).toISOString().slice(0, 10);

    // Borkowski's break years.
    function yearStart(year) {
        const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
            1635, 2060, 2097, 2192, 2324, 2394, 2456, 3178];
        let leapJ = -14;
        let previous = breaks[0];
        let jump = 0;
        for (const next of breaks.slice(1)) {
            jump = next - previous;
            if (year < next) break;
            leapJ += Math.trunc(jump / 33) * 8 + Math.trunc((jump % 33) / 4);
            previous = next;
        }
        const elapsed = year - previous;
        leapJ += Math.trunc(elapsed / 33) * 8 + Math.trunc((elapsed % 33 + 3) / 4);
        if (jump % 33 === 4 && jump - elapsed === 4) leapJ++;
        const gy = year + 621;
        const leapG = Math.trunc(gy / 4) - Math.trunc((Math.trunc(gy / 100) + 1) * 3 / 4) - 150;
        return Date.UTC(gy, 2, 20 + leapJ - leapG);
    }

    const monthOffset = month => month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
    const daysInMonth = (year, month) => month <= 6 ? 31 : month < 12 ? 30
        : (yearStart(year + 1) - yearStart(year)) / dayMs - 336;

    function dayAt(time) {
        if (!Number.isFinite(time) || time < yearStart(firstYear) || time >= yearStart(lastYear + 1)) return null;
        let year = new Date(time).getUTCFullYear() - 621;
        if (time < yearStart(year)) year--;
        const offset = (time - yearStart(year)) / dayMs;
        const month = offset < 186 ? Math.floor(offset / 31) + 1 : Math.floor((offset - 186) / 30) + 7;
        const day = offset - monthOffset(month) + 1;
        const jalali = `${year}/${pad(month)}/${pad(day)}`;
        return { year, month, day, jalali, display: persian(jalali), gregorian: iso(time), time };
    }

    function parseJalali(value) {
        const match = /^(\d{4})([/\-])(\d{1,2})\2(\d{1,2})$/.exec(latin(value));
        if (!match) return null;
        const [, y, , m, d] = match;
        const year = Number(y), month = Number(m), day = Number(d);
        if (year < firstYear || year > lastYear || month < 1 || month > 12
            || day < 1 || day > daysInMonth(year, month)) return null;
        return dayAt(yearStart(year) + (monthOffset(month) + day - 1) * dayMs);
    }

    function parseGregorian(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const time = Date.parse(`${value}T00:00:00Z`);
        return Number.isFinite(time) && iso(time) === value ? dayAt(time) : null;
    }

    function todayDate(timeZone = 'Asia/Tehran', now = new Date()) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone, calendar: 'gregory', numberingSystem: 'latn',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now);
        const part = type => parts.find(item => item.type === type).value;
        return parseGregorian(`${part('year')}-${part('month')}-${part('day')}`);
    }

    const weekday = time => (new Date(time).getUTCDay() + 1) % 7;
    const longDate = date => `${weekdays[weekday(date.time)]}، ${persian(date.day)} ${months[date.month - 1]} ${persian(date.year)}`;
    const resolve = (value, doc) => typeof value === 'string' ? doc?.querySelector(value) : value;

    const calendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m3 0h1m3 0h1"/></svg>';
    const arrow = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === 'right' ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'}"/></svg>`;
    const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    const downIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

    function mount(target, options = {}) {
        const input = resolve(target, typeof document === 'undefined' ? null : document);
        if (!input || input.tagName !== 'INPUT') throw new TypeError('JalaliPersianDatepicker.mount requires an input.');
        if (mounted.has(input)) return mounted.get(input);
        options = {
            trigger: input.dataset.jalaliTrigger,
            altInput: input.dataset.jalaliAlt,
            timeZone: input.dataset.jalaliTimezone,
            min: input.dataset.jalaliMin,
            max: input.dataset.jalaliMax,
            allowClear: input.hasAttribute('data-jalali-clear'),
            ...options
        };
        const doc = input.ownerDocument;
        const win = doc.defaultView;
        const trigger = resolve(options.trigger, doc);
        const altInput = resolve(options.altInput, doc);
        const container = resolve(options.container, doc);
        const boundary = resolve(options.boundary, doc);
        const timeZone = options.timeZone || 'Asia/Tehran';
        const lower = options.min == null ? dayAt(yearStart(firstYear)) : parseGregorian(options.min);
        const upper = options.max == null ? dayAt(yearStart(lastYear + 1) - dayMs) : parseGregorian(options.max);
        if (!lower || !upper || lower.time > upper.time) throw new RangeError('Invalid Gregorian date bounds.');
        const clamp = time => Math.min(upper.time, Math.max(lower.time, time));
        const allowed = date => date && date.time >= lower.time && date.time <= upper.time;
        const getDate = () => {
            const date = parseJalali(input.value);
            return allowed(date) ? date : null;
        };
        const id = `jalali-datepicker-${++sequence}`;
        const listeners = new win.AbortController();
        const controls = [...new Set([input, trigger].filter(Boolean))];
        const attrs = ['aria-expanded', 'aria-haspopup', 'aria-controls', 'aria-invalid'];
        const original = controls.map(el => attrs.map(name => el.getAttribute(name)));
        let panel, days, menu, menuButton, popupEvents, observer, opener, current, now, view;
        let frame = 0;

        function sync() {
            const date = getDate();
            if (altInput) altInput.value = date?.gregorian ?? '';
            return date;
        }

        function close(restoreFocus = false) {
            if (!panel) return;
            closeChoices();
            popupEvents.abort();
            observer.disconnect();
            if (frame) win.cancelAnimationFrame(frame);
            frame = 0;
            panel.remove();
            panel = null;
            if (active === picker) active = null;
            controls.forEach(el => {
                el.setAttribute('aria-expanded', 'false');
                el.removeAttribute('aria-controls');
            });
            if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
        }

        function place() {
            if (!panel) return;
            if (!input.isConnected || !panel.isConnected || !input.getClientRects().length) return close();
            const viewport = win.visualViewport;
            const viewportWidth = Math.min(viewport?.width ?? Infinity, doc.documentElement.clientWidth);
            const viewportHeight = viewport?.height ?? win.innerHeight;
            const sheet = viewportWidth <= 480 || viewportHeight <= 460;
            const edge = viewportWidth < 360 ? 4 : 8;
            const styles = win.getComputedStyle(panel);
            const inset = side => Math.max(edge, parseFloat(styles.getPropertyValue(`--jpd-safe-${side}`)) || 0);
            const leftLimit = (viewport?.offsetLeft ?? 0) + inset('left');
            const rightLimit = (viewport?.offsetLeft ?? 0) + viewportWidth - inset('right');
            const viewportTop = (viewport?.offsetTop ?? 0) + inset('top');
            const viewportBottom = (viewport?.offsetTop ?? 0) + viewportHeight - inset('bottom');
            const anchor = input.getBoundingClientRect();
            const bounds = boundary?.getBoundingClientRect();
            let topLimit = Math.max(viewportTop, bounds?.top ?? viewportTop);
            let bottomLimit = Math.min(viewportBottom, bounds?.bottom ?? viewportBottom);
            // A keyboard or rotation can leave too little room inside a modal body.
            if (sheet && bottomLimit - topLimit < Math.min(240, viewportBottom - viewportTop)) {
                topLimit = viewportTop;
                bottomLimit = viewportBottom;
            }
            if (bottomLimit <= topLimit || (!sheet && (anchor.bottom <= topLimit || anchor.top >= bottomLimit))) return close();
            panel.dataset.layout = sheet ? 'sheet' : 'anchored';
            panel.toggleAttribute('data-compact', bottomLimit - topLimit < 300);
            panel.style.maxWidth = `${rightLimit - leftLimit}px`;
            panel.style.maxHeight = `${bottomLimit - topLimit}px`;
            const { width, height } = panel.getBoundingClientRect();
            const below = anchor.bottom + edge;
            const top = below + height <= bottomLimit ? below : anchor.top - height - edge;
            panel.style.top = `${sheet ? bottomLimit - height : Math.max(topLimit, Math.min(top, bottomLimit - height))}px`;
            panel.style.left = `${sheet ? (leftLimit + rightLimit - width) / 2
                : Math.max(leftLimit, Math.min(anchor.right - width, rightLimit - width))}px`;
        }

        function schedulePlace() {
            if (frame) return;
            frame = win.requestAnimationFrame(() => {
                frame = 0;
                place();
                if (!panel) return;
                const focused = doc.activeElement;
                if (menuButton && menu.contains(focused)) reveal(focused, menu);
                else if (days.contains(focused)) reveal(focused, days);
            });
        }

        function reveal(item, scroller, center = false) {
            const bounds = scroller.getBoundingClientRect();
            const rect = item.getBoundingClientRect();
            const top = bounds.top + (scroller === days ? days.querySelector('thead').offsetHeight : 0);
            if (center) scroller.scrollTop += (rect.top + rect.bottom - top - bounds.bottom) / 2;
            else if (rect.top < top) scroller.scrollTop += rect.top - top;
            else if (rect.bottom > bounds.bottom) scroller.scrollTop += rect.bottom - bounds.bottom;
        }

        function render(focus = false) {
            const { year, month, day } = view;
            const first = yearStart(year) + monthOffset(month) * dayMs;
            const count = daysInMonth(year, month);
            const start = weekday(first);
            panel.querySelector('.jpd-month span').textContent = months[month - 1];
            panel.querySelector('.jpd-year span').textContent = persian(year);
            panel.querySelector('.jpd-prev').disabled = first <= lower.time;
            panel.querySelector('.jpd-next').disabled = first + count * dayMs > upper.time;
            panel.querySelector('.jpd-title').textContent = `${months[month - 1]} ${persian(year)}`;
            let rows = '';
            for (let i = 0; i < Math.ceil((start + count) / 7) * 7; i++) {
                if (i % 7 === 0) rows += '<tr>';
                const number = i - start + 1;
                if (number < 1 || number > count) rows += '<td class="jpd-empty"></td>';
                else {
                    const date = dayAt(first + (number - 1) * dayMs);
                    const selected = date.time === current?.time;
                    const isToday = date.time === now.time;
                    const friday = i % 7 === 6;
                    rows += `<td aria-selected="${selected}"><button type="button" class="jpd-day${friday ? ' jpd-friday' : ''}"
                        data-day="${number}" data-time="${date.time}" aria-label="${longDate(date)}"
                        ${isToday ? 'aria-current="date"' : ''} tabindex="${number === day ? '0' : '-1'}"
                        ${allowed(date) ? '' : 'disabled'}>${persian(number)}</button></td>`;
                }
                if (i % 7 === 6) rows += '</tr>';
            }
            panel.querySelector('tbody').innerHTML = rows;
            place();
            const activeDay = panel?.querySelector('.jpd-day[tabindex="0"]');
            if (!activeDay) return;
            if (focus) activeDay.focus({ preventScroll: true });
            reveal(activeDay, days);
        }

        function moveMonth(year, month, focus = false) {
            const shift = year * 12 + month - 1;
            const nextYear = Math.floor(shift / 12);
            const nextMonth = shift % 12 + 1;
            const nextDay = Math.min(view.day, daysInMonth(nextYear, nextMonth));
            view = dayAt(clamp(yearStart(nextYear) + (monthOffset(nextMonth) + nextDay - 1) * dayMs));
            render(focus);
        }

        function closeChoices(restoreFocus = false) {
            if (!menuButton) return;
            const button = menuButton;
            menuButton = null;
            menu.hidden = true;
            days.inert = false;
            menu.replaceChildren();
            button.setAttribute('aria-expanded', 'false');
            if (restoreFocus) button.focus({ preventScroll: true });
        }

        function focusChoice(option, center = false) {
            if (!option) return;
            const previous = menu.querySelector('[tabindex="0"]');
            if (previous) previous.tabIndex = -1;
            option.tabIndex = 0;
            option.focus({ preventScroll: true });
            reveal(option, menu, center);
        }

        function toggleChoices(button) {
            if (button === menuButton) return closeChoices(true);
            closeChoices();
            menuButton = button;
            const isMonth = button.dataset.choice === 'month';
            const first = isMonth ? 1 : lower.year;
            const last = isMonth ? 12 : upper.year;
            const selected = isMonth ? view.month : view.year;
            const fragment = doc.createDocumentFragment();
            let selectedOption;
            for (let value = first; value <= last; value++) {
                const option = doc.createElement('button');
                option.type = 'button';
                option.className = 'jpd-option';
                option.dataset.value = value;
                option.tabIndex = -1;
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', String(value === selected));
                option.textContent = isMonth ? months[value - 1] : persian(value);
                option.disabled = isMonth && ((view.year === lower.year && value < lower.month)
                    || (view.year === upper.year && value > upper.month));
                if (value === selected) selectedOption = option;
                fragment.append(option);
            }
            menu.dataset.kind = button.dataset.choice;
            menu.setAttribute('aria-label', isMonth ? 'ماه‌های شمسی' : 'سال‌های شمسی');
            menu.append(fragment);
            menu.hidden = false;
            days.inert = true;
            menu.scrollTop = 0;
            button.setAttribute('aria-expanded', 'true');
            place();
            if (panel) focusChoice(selectedOption, true);
        }

        function setDate(value, { notify = false } = {}) {
            const date = parseGregorian(value);
            if (value != null && value !== '' && !allowed(date)) return false;
            input.value = date?.display ?? '';
            input.removeAttribute('aria-invalid');
            sync();
            if (notify) {
                input.dispatchEvent(new win.Event('input', { bubbles: true }));
                input.dispatchEvent(new win.Event('change', { bubbles: true }));
            }
            if (panel) refresh();
            return true;
        }

        function refresh() {
            closeChoices();
            current = getDate();
            view = current || dayAt(clamp(now.time));
            panel.querySelector('.jpd-caption').textContent = current ? longDate(current) : 'روز مورد نظر را انتخاب کنید';
            render();
        }

        function select(time) {
            const date = dayAt(time);
            if (!allowed(date)) return;
            close(true);
            setDate(date.gregorian, { notify: true });
        }

        function open(source = input, focus = true) {
            if (input.matches(':disabled') || !input.isConnected || !input.getClientRects().length) return;
            if (panel) {
                if (focus) panel.querySelector('.jpd-day[tabindex="0"]')?.focus();
                return;
            }
            active?.close();
            active = picker;
            opener = source;
            now = todayDate(timeZone);
            if (!now) { active = null; return; }
            panel = doc.createElement('div');
            panel.id = id;
            panel.className = 'jpd-popover';
            panel.dir = 'rtl';
            panel.lang = 'fa';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', 'تقویم شمسی');
            const choice = (kind, label) => `<button type="button" class="jpd-choice jpd-${kind}" data-choice="${kind}"
                aria-label="${label}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-choices"><span></span>${downIcon}</button>`;
            panel.innerHTML = `<header class="jpd-heading"><span class="jpd-emblem">${calendarIcon}</span>
                <div><div class="jpd-title" id="${id}-title" aria-live="polite"></div><div class="jpd-caption"></div></div>
                <button type="button" class="jpd-icon jpd-close" aria-label="بستن تقویم">${closeIcon}</button></header>
                <div class="jpd-navigation"><button type="button" class="jpd-icon jpd-prev" aria-label="ماه قبل">${arrow('right')}</button>
                ${choice('month', 'انتخاب ماه')}${choice('year', 'انتخاب سال')}
                <button type="button" class="jpd-icon jpd-next" aria-label="ماه بعد">${arrow('left')}</button></div>
                <div class="jpd-body"><div class="jpd-days"><table role="grid" class="jpd-grid" aria-labelledby="${id}-title"><thead><tr>${weekdays.map((name, i) =>
                    `<th scope="col" aria-label="${name}"${i === 6 ? ' class="jpd-friday"' : ''}>${['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'][i]}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
                <div id="${id}-choices" class="jpd-choices" role="listbox" tabindex="-1" hidden></div></div>
                <footer class="jpd-footer"><span class="jpd-today-caption"><span></span> ${persian(now.day)} ${months[now.month - 1]}</span>
                ${options.allowClear ? '<button type="button" class="jpd-clear">پاک کردن</button>' : ''}
                <button type="button" class="jpd-today" ${allowed(now) ? '' : 'disabled'}>انتخاب امروز</button></footer>`;
            menu = panel.querySelector('.jpd-choices');
            days = panel.querySelector('.jpd-days');
            if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
            const host = container || input.closest('dialog, [role="dialog"]') || doc.body;
            host.append(panel);
            if (panel.hasAttribute('popover')) panel.showPopover();
            controls.forEach(el => {
                el.setAttribute('aria-expanded', 'true');
                el.setAttribute('aria-controls', id);
            });

            popupEvents = new win.AbortController();
            const signal = popupEvents.signal;
            observer = new win.MutationObserver(() => {
                if (input.matches(':disabled') || !input.isConnected || !panel?.isConnected || host.hidden
                    || host.getAttribute('aria-hidden') === 'true') close();
            });
            observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
            if (host !== doc.body) observer.observe(host, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
            // Clicking calendar chrome must not send focus to the surrounding modal.
            panel.addEventListener('mousedown', event => {
                if (event.button !== 0 || event.target.closest('.jpd-heading, .jpd-footer')
                    && !event.target.closest('button:not(:disabled)')) event.preventDefault();
            }, { signal });
            panel.addEventListener('click', event => {
                if (input.matches(':disabled')) return close();
                const button = event.target.closest('button');
                if (button?.dataset.choice) return toggleChoices(button);
                if (menuButton && button?.matches('.jpd-option:not(:disabled)')) {
                    const value = Number(button.dataset.value);
                    const isMonth = menuButton.dataset.choice === 'month';
                    closeChoices(true);
                    return isMonth ? moveMonth(view.year, value) : moveMonth(value, view.month);
                }
                if (menuButton && !menu.contains(event.target)) closeChoices();
                if (!button || button.disabled) return;
                if (button.dataset.time) select(Number(button.dataset.time));
                else if (button.matches('.jpd-prev')) moveMonth(view.year, view.month - 1);
                else if (button.matches('.jpd-next')) moveMonth(view.year, view.month + 1);
                else if (button.matches('.jpd-today')) select(now.time);
                else if (button.matches('.jpd-close')) close(true);
                else if (button.matches('.jpd-clear')) { close(true); setDate(null, { notify: true }); }
            }, { signal });
            panel.addEventListener('keydown', event => {
                if (event.target.matches('.jpd-choice') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                    event.preventDefault();
                    if (event.target !== menuButton) toggleChoices(event.target);
                    else focusChoice(menu.querySelector('[aria-selected="true"]'));
                    return;
                }
                if (menuButton && menu.contains(event.target)) {
                    const options = Array.from(menu.querySelectorAll('.jpd-option:enabled'));
                    const columns = menu.dataset.kind === 'month' ? 3 : 4;
                    const index = options.indexOf(event.target);
                    const steps = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: columns, ArrowUp: -columns,
                        PageUp: -columns * 4, PageDown: columns * 4 };
                    if (event.key === 'Tab') {
                        event.preventDefault();
                        closeChoices(true);
                    } else if (event.key === 'Home' || event.key === 'End' || Object.hasOwn(steps, event.key)) {
                        event.preventDefault();
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + steps[event.key];
                        focusChoice(options[Math.min(options.length - 1, Math.max(0, next))]);
                    }
                    return;
                }
                if (!event.target.matches('.jpd-day')) return;
                const date = dayAt(Number(event.target.dataset.time));
                if (event.key === 'PageUp' || event.key === 'PageDown') {
                    event.preventDefault();
                    moveMonth(date.year, date.month + (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), true);
                    return;
                }
                const offsets = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7,
                    Home: -weekday(date.time), End: 6 - weekday(date.time) };
                if (!Object.hasOwn(offsets, event.key)) return;
                event.preventDefault();
                view = dayAt(clamp(date.time + offsets[event.key] * dayMs));
                render(true);
            }, { signal });
            const outside = event => {
                if (panel && !panel.contains(event.target) && !controls.some(el => el.contains(event.target))) close();
                else if (event.type === 'focusin' && menuButton && !menu.contains(event.target) && !menuButton.contains(event.target)) closeChoices();
            };
            doc.addEventListener('pointerdown', outside, { capture: true, signal });
            doc.addEventListener('focusin', outside, { capture: true, signal });
            doc.addEventListener('keydown', event => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                if (menuButton) closeChoices(true);
                else close(true);
            }, { capture: true, signal });
            doc.addEventListener('scroll', event => {
                if (!panel?.contains(event.target)) schedulePlace();
            }, { capture: true, passive: true, signal });
            win.addEventListener('resize', schedulePlace, { signal });
            win.visualViewport?.addEventListener('resize', schedulePlace, { signal });
            win.visualViewport?.addEventListener('scroll', schedulePlace, { signal });
            if (host.tagName === 'DIALOG') host.addEventListener('close', () => close(), { signal });
            refresh();
            if (focus) panel?.querySelector('.jpd-day[tabindex="0"]')?.focus({ preventScroll: true });
        }

        function destroy() {
            close();
            listeners.abort();
            controls.forEach((el, index) => attrs.forEach((name, i) => {
                const value = original[index][i];
                if (value === null) el.removeAttribute(name);
                else el.setAttribute(name, value);
            }));
            mounted.delete(input);
        }

        const picker = Object.freeze({ open: () => open(), close, destroy, getDate, setDate });
        mounted.set(input, picker);
        const signal = listeners.signal;
        controls.forEach(el => {
            el.setAttribute('aria-expanded', 'false');
            el.setAttribute('aria-haspopup', 'dialog');
        });
        input.addEventListener('click', () => open(input, false), { signal });
        input.addEventListener('keydown', event => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            open(input);
        }, { signal });
        trigger?.addEventListener('click', () => panel ? close(true) : open(trigger), { signal });
        input.addEventListener('input', () => {
            input.removeAttribute('aria-invalid');
            sync();
            // Manual entry replaces the active calendar selection.
            if (doc.activeElement === input) close();
        }, { signal });
        input.addEventListener('change', () => {
            const date = sync();
            if (date) input.value = date.display;
            if (!date && latin(input.value)) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
            options.onChange?.(date);
        }, { signal });
        const initial = !latin(input.value) ? parseGregorian(altInput?.value) : null;
        if (allowed(initial)) setDate(initial.gregorian);
        else sync();
        return picker;
    }

    function mountAll(root = document, options = {}) {
        return Array.from(root.querySelectorAll('input[data-jalali-datepicker]'), input => mount(input, options));
    }

    return Object.freeze({
        mount, mountAll, parseJalali, parseGregorian,
        toGregorian: value => parseJalali(value)?.gregorian ?? '',
        toJalali: value => parseGregorian(value)?.display ?? '',
        today: (timeZone, now) => todayDate(timeZone, now)?.display ?? ''
    });
});
