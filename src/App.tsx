import React, { useState, useMemo, useEffect } from 'react';
import { Clock, DollarSign, Coffee, Calculator, Download, Settings2, ChevronDown, ChevronUp, RotateCcw, Calendar, Save, List, Trash2, ChevronLeft, ChevronRight, BarChart3, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type CustomRule = {
  id: string;
  name: string;
  type: 'fixed' | 'hourly' | 'multiplier' | 'time_addition';
  value: string;
  startTime?: string;
  endTime?: string;
};

function useLocalState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        // Handle migration for plain string baseWage
        if (typeof defaultValue === 'string' && !item.startsWith('"') && !item.startsWith('{') && !item.startsWith('[')) {
            return item as unknown as T;
        }
        return JSON.parse(item);
      }
    } catch (e) {
      console.warn('Error reading localStorage', e);
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, typeof state === 'string' ? state : JSON.stringify(state));
    } catch (e) {
      console.warn('Error setting localStorage', e);
    }
  }, [key, state]);

  return [state, setState];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'calc' | 'monthly'>('calc');
  const [records, setRecords] = useState<Record<string, { totalPay: number, workedMins: number }>>({});
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('payroll_records');
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse records');
      }
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [baseWage, setBaseWage] = useLocalState<string>('payroll_base_wage', '1000');
  const [startTime, setStartTime] = useLocalState<string>('payroll_startTime', '09:00');
  const [endTime, setEndTime] = useLocalState<string>('payroll_endTime', '18:00');
  const [breakType, setBreakType] = useLocalState<'minutes' | 'range'>('payroll_breakType', 'minutes');
  const [breakTime, setBreakTime] = useLocalState<string>('payroll_breakTime', '60');
  const [breakStartTime, setBreakStartTime] = useLocalState<string>('payroll_breakStartTime', '12:00');
  const [breakEndTime, setBreakEndTime] = useLocalState<string>('payroll_breakEndTime', '13:00');

  // Custom Rules State
  const [showSettings, setShowSettings] = useLocalState<boolean>('payroll_showSettings', false);
  const [overtimeThreshold, setOvertimeThreshold] = useLocalState<string>('payroll_overtimeThreshold', '8');
  const [overtimeMultiplier, setOvertimeMultiplier] = useLocalState<string>('payroll_overtimeMultiplier', '1.25');
  const [lateNightStart, setLateNightStart] = useLocalState<string>('payroll_lateNightStart', '22:00');
  const [lateNightEnd, setLateNightEnd] = useLocalState<string>('payroll_lateNightEnd', '05:00');
  const [lateNightMultiplier, setLateNightMultiplier] = useLocalState<string>('payroll_lateNightMultiplier', '1.25');
  const [overlapMultiplier, setOverlapMultiplier] = useLocalState<string>('payroll_overlapMultiplier', '1.5');

  const [customRules, setCustomRules] = useLocalState<CustomRule[]>('payroll_customRules', []);

  const addCustomRule = () => {
    setCustomRules([...customRules, { id: Date.now().toString(), name: '新規ルール', type: 'fixed', value: '0', startTime: '05:00', endTime: '09:00' }]);
  };

  const updateCustomRule = (id: string, field: keyof CustomRule, value: string) => {
    setCustomRules(customRules.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeCustomRule = (id: string) => {
    setCustomRules(customRules.filter(r => r.id !== id));
  };

  const defaultLabels = {
    overtimeThreshold: '残業となる時間 (時間)',
    overtimeMultiplier: '残業手当',
    lateNightStart: '深夜手当 開始',
    lateNightEnd: '深夜手当 終了',
    lateNightMultiplier: '深夜手当',
    overlapMultiplier: '残業＋深夜',
  };
  const [ruleLabels, setRuleLabels] = useState(defaultLabels);

  const result = useMemo(() => {
    if (!startTime || !endTime) return null;

    let wage = Number(baseWage) || 0;
    
    const hourlyAdditions = customRules
      .filter(r => r.type === 'hourly')
      .reduce((sum, r) => sum + (Number(r.value) || 0), 0);
    wage += hourlyAdditions;

    const multipliers = customRules
      .filter(r => r.type === 'multiplier')
      .reduce((mult, r) => mult * (Number(r.value) || 1), 1);
    wage *= multipliers;

    const effectiveWage = wage;

    const otThresholdMins = (Number(overtimeThreshold) || 8) * 60;
    const otMult = Number(overtimeMultiplier) || 1.25;
    const lnMult = Number(lateNightMultiplier) || 1.25;
    const ovMult = Number(overlapMultiplier) || 1.5;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const [lnStartH, lnStartM] = (lateNightStart || '22:00').split(':').map(Number);
    const [lnEndH, lnEndM] = (lateNightEnd || '05:00').split(':').map(Number);
    const lnStartMin = lnStartH * 60 + lnStartM;
    const lnEndMin = lnEndH * 60 + lnEndM;

    let startMin = startH * 60 + startM;
    let endMin = endH * 60 + endM;

    // 深夜をまたぐ場合（例: 22:00 〜 06:00）
    if (endMin <= startMin) {
      endMin += 24 * 60;
    }

    const totalElapsed = endMin - startMin;
    
    let absBreakStart = -1;
    let absBreakEnd = -1;
    let bStartMin = 0;
    let bEndMin = 0;

    if (breakType === 'minutes') {
      const brk = Number(breakTime) || 0;
      const actualBreakTime = Math.min(brk, totalElapsed); // 拘束時間を超える休憩は丸める
      // 休憩時間を勤務時間の中央に配置して計算する（深夜手当などの計算を公平にするため）
      absBreakStart = startMin + Math.floor((totalElapsed - actualBreakTime) / 2);
      absBreakEnd = absBreakStart + actualBreakTime;
    } else {
      const [bsH, bsM] = (breakStartTime || '12:00').split(':').map(Number);
      const [beH, beM] = (breakEndTime || '13:00').split(':').map(Number);
      bStartMin = bsH * 60 + bsM;
      bEndMin = beH * 60 + beM;
    }

    let regularMins = 0;
    let overtimeMins = 0;
    let lateNightMins = 0;
    let overtimeLateNightMins = 0;

    let workedMins = 0;
    let actualBreakMins = 0;

    const timeRules = customRules.filter(r => r.type === 'time_addition');
    const parsedTimeRules = timeRules.map(r => {
      const [sH, sM] = (r.startTime || '05:00').split(':').map(Number);
      const [eH, eM] = (r.endTime || '09:00').split(':').map(Number);
      return {
        ...r,
        startMin: sH * 60 + sM,
        endMin: eH * 60 + eM,
        addition: Number(r.value) || 0,
        payAcc: 0,
        minsAcc: 0
      };
    });

    // 1分ごとに労働時間を判定
    for (let i = 0; i < totalElapsed; i++) {
      const absoluteMin = startMin + i;
      const currentClockMin = absoluteMin % (24 * 60);

      let isBreak = false;
      if (breakType === 'range') {
        isBreak = bStartMin <= bEndMin 
          ? (currentClockMin >= bStartMin && currentClockMin < bEndMin)
          : (currentClockMin >= bStartMin || currentClockMin < bEndMin);
      } else {
        isBreak = absoluteMin >= absBreakStart && absoluteMin < absBreakEnd;
      }

      if (isBreak) {
        actualBreakMins++;
        continue; // 休憩時間はスキップ
      }

      workedMins++;
      
      // 時間帯別手当の判定
      parsedTimeRules.forEach(tr => {
        const isMatch = tr.startMin <= tr.endMin 
          ? (currentClockMin >= tr.startMin && currentClockMin < tr.endMin)
          : (currentClockMin >= tr.startMin || currentClockMin < tr.endMin);
        if (isMatch) {
          tr.minsAcc++;
          tr.payAcc += tr.addition / 60;
        }
      });
      
      // 深夜時間の判定
      const isLateNight = lnStartMin <= lnEndMin 
        ? (currentClockMin >= lnStartMin && currentClockMin < lnEndMin)
        : (currentClockMin >= lnStartMin || currentClockMin < lnEndMin);
        
      // 残業時間の判定
      const isOvertime = workedMins > otThresholdMins;

      if (isOvertime && isLateNight) {
        overtimeLateNightMins++;
      } else if (isOvertime && !isLateNight) {
        overtimeMins++;
      } else if (!isOvertime && isLateNight) {
        lateNightMins++;
      } else {
        regularMins++;
      }
    }

    const regularPay = (regularMins / 60) * effectiveWage;
    const overtimePay = (overtimeMins / 60) * effectiveWage * otMult;
    const lateNightPay = (lateNightMins / 60) * effectiveWage * lnMult;
    const overtimeLateNightPay = (overtimeLateNightMins / 60) * effectiveWage * ovMult;

    const fixedRules = customRules.filter(r => r.type === 'fixed');
    const fixedAdditions = fixedRules.reduce((sum, r) => sum + (Number(r.value) || 0), 0);

    const timeRuleAdditions = parsedTimeRules.reduce((sum, tr) => sum + tr.payAcc, 0);

    const totalPay = regularPay + overtimePay + lateNightPay + overtimeLateNightPay + fixedAdditions + timeRuleAdditions;

    return {
      workedMins,
      actualBreakMins,
      regularMins,
      overtimeMins,
      lateNightMins,
      overtimeLateNightMins,
      totalPay: Math.floor(totalPay),
      effectiveWage,
      otMult,
      lnMult,
      ovMult,
      breakdown: {
        regularPay: Math.floor(regularPay),
        overtimePay: Math.floor(overtimePay),
        lateNightPay: Math.floor(lateNightPay),
        overtimeLateNightPay: Math.floor(overtimeLateNightPay),
        fixedRules: fixedRules.map(r => ({ name: r.name, value: Number(r.value) || 0 })),
        timeRules: parsedTimeRules.map(tr => ({ name: tr.name, pay: Math.floor(tr.payAcc), mins: tr.minsAcc }))
      }
    };
  }, [baseWage, startTime, endTime, breakType, breakTime, breakStartTime, breakEndTime, overtimeThreshold, overtimeMultiplier, lateNightStart, lateNightEnd, lateNightMultiplier, overlapMultiplier, customRules]);

  const saveRecord = () => {
    if (!result) return;
    if (!window.confirm('保存しますか？')) return;
    const newRecords = {
      ...records,
      [workDate]: {
        totalPay: result.totalPay,
        workedMins: result.workedMins,
      }
    };
    setRecords(newRecords);
    localStorage.setItem('payroll_records', JSON.stringify(newRecords));
    showToast(`${workDate} の給与を保存しました`);
  };

  const deleteRecord = (dateStr: string) => {
    const newRecords = { ...records };
    delete newRecords[dateStr];
    setRecords(newRecords);
    localStorage.setItem('payroll_records', JSON.stringify(newRecords));
    showToast(`${dateStr} の記録を削除しました`);
  };

  const prevMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
  };

  const monthlyData = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth() + 1;
    const prefix = `${year}-${month.toString().padStart(2, '0')}`;
    
    const monthRecords = Object.entries(records)
      .filter(([date]) => date.startsWith(prefix))
      .sort((a, b) => a[0].localeCompare(b[0]));

    const totalPay = monthRecords.reduce((sum, [_, data]) => sum + data.totalPay, 0);
    const totalMins = monthRecords.reduce((sum, [_, data]) => sum + data.workedMins, 0);

    return { monthRecords, totalPay, totalMins, year, month };
  }, [records, currentMonthDate]);

  const allMonthsChartData = useMemo(() => {
    const aggregated: Record<string, number> = {};
    Object.entries(records).forEach(([date, data]) => {
      const monthKey = date.substring(0, 7); // "YYYY-MM"
      aggregated[monthKey] = (aggregated[monthKey] || 0) + data.totalPay;
    });
    return Object.entries(aggregated)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, total]) => {
        const [y, m] = month.split('-');
        return { 
          month, 
          label: `${Number(m)}月`,
          total 
        };
      });
  }, [records]);

  const handleReset = () => {
    setWorkDate(new Date().toISOString().split('T')[0]);
    setBaseWage('1000');
    setStartTime('09:00');
    setEndTime('18:00');
    setBreakType('minutes');
    setBreakTime('60');
    setBreakStartTime('12:00');
    setBreakEndTime('13:00');
    setOvertimeThreshold('8');
    setOvertimeMultiplier('1.25');
    setLateNightStart('22:00');
    setLateNightEnd('05:00');
    setLateNightMultiplier('1.25');
    setOverlapMultiplier('1.5');
    setRuleLabels(defaultLabels);
    setCustomRules([]);
    setShowSettings(false);
  };

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}時間${m > 0 ? ` ${m}分` : ''}`;
  };

  const exportToCSV = () => {
    if (!result) return;

    const fixedAdditions = result.breakdown.fixedRules.reduce((sum, r) => sum + r.value, 0);
    const timeRuleAdditions = result.breakdown.timeRules.reduce((sum, r) => sum + r.pay, 0);
    const customAdditions = fixedAdditions + timeRuleAdditions;

    const headers = [
      '勤務日',
      '基本時給(円)',
      '出勤時間',
      '退勤時間',
      '休憩時間(分)',
      '総労働時間',
      '基本給',
      ruleLabels.overtimeMultiplier,
      ruleLabels.lateNightMultiplier,
      ruleLabels.overlapMultiplier,
      'カスタム手当・控除',
      '総給与'
    ];

    const row = [
      workDate,
      baseWage,
      startTime,
      endTime,
      result.actualBreakMins,
      formatHours(result.workedMins),
      result.breakdown.regularPay,
      result.breakdown.overtimePay,
      result.breakdown.lateNightPay,
      result.breakdown.overtimeLateNightPay,
      customAdditions,
      result.totalPay
    ];

    const csvContent = [
      headers.join(','),
      row.map(value => `"${value}"`).join(',')
    ].join('\n');

    // Add BOM for Excel UTF-8 compatibility
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payroll_${workDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-900 pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center py-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center justify-center gap-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            給与計算アプリ
          </h1>
          <p className="text-sm text-gray-500 mt-1">アルバイトの給与を簡単計算</p>
        </div>

        {/* タブ切り替え */}
        <div className="flex bg-gray-200/70 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('calc')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === 'calc' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Calculator className="w-4 h-4" />
            日次計算
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === 'monthly' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <List className="w-4 h-4" />
            月間集計
          </button>
        </div>

        {activeTab === 'calc' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5 relative">
              <div className="flex justify-end -mb-2">
            <button
              onClick={handleReset}
              className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
              title="すべての入力をリセット"
            >
              <RotateCcw className="w-4 h-4" />
              クリア
            </button>
          </div>

          {/* 勤務日と基本時給 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                勤務日
              </label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-gray-400" />
                基本時給 (円)
              </label>
              <input
                type="number"
                value={baseWage}
                onChange={(e) => setBaseWage(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="1000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 出勤時間 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Clock className="w-4 h-4 text-gray-400" />
                出勤時間
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            {/* 退勤時間 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Clock className="w-4 h-4 text-gray-400" />
                退勤時間
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* 休憩時間 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">
                <Coffee className="w-4 h-4 text-gray-400" />
                休憩時間
              </label>
              <select 
                value={breakType} 
                onChange={(e) => setBreakType(e.target.value as 'minutes' | 'range')}
                className="text-sm bg-transparent text-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="minutes">時間(分)で指定</option>
                <option value="range">時間帯で指定</option>
              </select>
            </div>
            {breakType === 'minutes' ? (
              <div className="relative">
                <input
                  type="number"
                  value={breakTime}
                  onChange={(e) => setBreakTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="60"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">分</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={breakStartTime}
                  onChange={(e) => setBreakStartTime(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <span className="text-gray-500">〜</span>
                <input
                  type="time"
                  value={breakEndTime}
                  onChange={(e) => setBreakEndTime(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Custom Rules Section (Always visible) */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-gray-400" />
                特別手当・控除 (土日祝など)
              </label>
              <button
                onClick={addCustomRule}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                追加する
              </button>
            </div>
            
            <div className="space-y-3">
              {customRules.map(rule => (
                <div key={rule.id} className="flex flex-col gap-2 bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={rule.name}
                      onChange={(e) => updateCustomRule(rule.id, 'name', e.target.value)}
                      className="w-1/3 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="例: 早朝手当"
                    />
                    <select
                      value={rule.type}
                      onChange={(e) => updateCustomRule(rule.id, 'type', e.target.value as any)}
                      className="w-1/3 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="fixed">固定額 (円)</option>
                      <option value="hourly">終日時給アップ (円)</option>
                      <option value="multiplier">終日時給倍率 (倍)</option>
                      <option value="time_addition">時間帯で時給アップ (円)</option>
                    </select>
                    <input
                      type="number"
                      step={rule.type === 'multiplier' ? "0.01" : "1"}
                      value={rule.value}
                      onChange={(e) => updateCustomRule(rule.id, 'value', e.target.value)}
                      className="w-1/4 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="100"
                    />
                    <button
                      onClick={() => removeCustomRule(rule.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {rule.type === 'time_addition' && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 pl-1 mt-1">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>対象時間:</span>
                      <input 
                        type="time" 
                        value={rule.startTime || '05:00'} 
                        onChange={(e) => updateCustomRule(rule.id, 'startTime', e.target.value)} 
                        className="px-2 py-1 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      />
                      <span>〜</span>
                      <input 
                        type="time" 
                        value={rule.endTime || '09:00'} 
                        onChange={(e) => updateCustomRule(rule.id, 'endTime', e.target.value)} 
                        className="px-2 py-1 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Settings Toggle */}
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors w-full justify-center py-2"
            >
              <Settings2 className="w-4 h-4" />
              計算ルールのカスタマイズ
              {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-4 text-sm animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    value={ruleLabels.overtimeThreshold}
                    onChange={(e) => setRuleLabels({...ruleLabels, overtimeThreshold: e.target.value})}
                    className="w-full text-gray-700 mb-1 bg-transparent border-b border-dashed border-gray-300 focus:border-solid focus:border-blue-500 focus:outline-none p-0 text-sm"
                    title="ラベルを編集"
                  />
                  <input
                    type="number"
                    value={overtimeThreshold}
                    onChange={(e) => setOvertimeThreshold(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={ruleLabels.overtimeMultiplier}
                    onChange={(e) => setRuleLabels({...ruleLabels, overtimeMultiplier: e.target.value})}
                    className="w-full text-gray-700 mb-1 bg-transparent border-b border-dashed border-gray-300 focus:border-solid focus:border-blue-500 focus:outline-none p-0 text-sm"
                    title="ラベルを編集"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={overtimeMultiplier}
                    onChange={(e) => setOvertimeMultiplier(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={ruleLabels.lateNightStart}
                    onChange={(e) => setRuleLabels({...ruleLabels, lateNightStart: e.target.value})}
                    className="w-full text-gray-700 mb-1 bg-transparent border-b border-dashed border-gray-300 focus:border-solid focus:border-blue-500 focus:outline-none p-0 text-sm"
                    title="ラベルを編集"
                  />
                  <input
                    type="time"
                    value={lateNightStart}
                    onChange={(e) => setLateNightStart(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={ruleLabels.lateNightEnd}
                    onChange={(e) => setRuleLabels({...ruleLabels, lateNightEnd: e.target.value})}
                    className="w-full text-gray-700 mb-1 bg-transparent border-b border-dashed border-gray-300 focus:border-solid focus:border-blue-500 focus:outline-none p-0 text-sm"
                    title="ラベルを編集"
                  />
                  <input
                    type="time"
                    value={lateNightEnd}
                    onChange={(e) => setLateNightEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={ruleLabels.lateNightMultiplier}
                    onChange={(e) => setRuleLabels({...ruleLabels, lateNightMultiplier: e.target.value})}
                    className="w-full text-gray-700 mb-1 bg-transparent border-b border-dashed border-gray-300 focus:border-solid focus:border-blue-500 focus:outline-none p-0 text-sm"
                    title="ラベルを編集"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={lateNightMultiplier}
                    onChange={(e) => setLateNightMultiplier(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={ruleLabels.overlapMultiplier}
                    onChange={(e) => setRuleLabels({...ruleLabels, overlapMultiplier: e.target.value})}
                    className="w-full text-gray-700 mb-1 bg-transparent border-b border-dashed border-gray-300 focus:border-solid focus:border-blue-500 focus:outline-none p-0 text-sm"
                    title="ラベルを編集"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={overlapMultiplier}
                    onChange={(e) => setOverlapMultiplier(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 計算結果 */}
        {result && (
          <div className="bg-blue-600 rounded-2xl shadow-lg p-6 text-white space-y-6">
            <div className="text-center">
              <p className="text-blue-100 text-sm font-medium mb-1">見込給与</p>
              <div className="text-4xl font-bold tracking-tight">
                ¥{result.totalPay.toLocaleString()}
              </div>
              <p className="text-blue-200 text-sm mt-2">
                総労働時間: {formatHours(result.workedMins)}
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-blue-500/50">
              {customRules.filter(r => r.type === 'hourly' || r.type === 'multiplier').length > 0 && (
                <div className="flex justify-between items-center text-sm pb-2 border-b border-blue-500/30">
                  <span className="text-blue-100">適用後の基本時給</span>
                  <span className="font-medium">¥{Math.floor(result.effectiveWage).toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm">
                <span className="text-blue-100">基本給 (1.0倍)</span>
                <div className="text-right">
                  <span className="block font-medium">¥{result.breakdown.regularPay.toLocaleString()}</span>
                  <span className="text-xs text-blue-200">{formatHours(result.regularMins)}</span>
                </div>
              </div>
              
              {result.overtimeMins > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-blue-100">{ruleLabels.overtimeMultiplier} ({result.otMult}倍)</span>
                  <div className="text-right">
                    <span className="block font-medium">¥{result.breakdown.overtimePay.toLocaleString()}</span>
                    <span className="text-xs text-blue-200">{formatHours(result.overtimeMins)}</span>
                  </div>
                </div>
              )}

              {result.lateNightMins > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-blue-100">{ruleLabels.lateNightMultiplier} ({result.lnMult}倍)</span>
                  <div className="text-right">
                    <span className="block font-medium">¥{result.breakdown.lateNightPay.toLocaleString()}</span>
                    <span className="text-xs text-blue-200">{formatHours(result.lateNightMins)}</span>
                  </div>
                </div>
              )}

              {result.overtimeLateNightMins > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-blue-100">{ruleLabels.overlapMultiplier} ({result.ovMult}倍)</span>
                  <div className="text-right">
                    <span className="block font-medium">¥{result.breakdown.overtimeLateNightPay.toLocaleString()}</span>
                    <span className="text-xs text-blue-200">{formatHours(result.overtimeLateNightMins)}</span>
                  </div>
                </div>
              )}

              {result.breakdown.fixedRules.map((rule, idx) => (
                <div key={`fixed-${idx}`} className="flex justify-between items-center text-sm pt-2 border-t border-blue-500/30">
                  <span className="text-blue-100">{rule.name}</span>
                  <span className="font-medium">{rule.value >= 0 ? '+' : ''}¥{rule.value.toLocaleString()}</span>
                </div>
              ))}

              {result.breakdown.timeRules.map((rule, idx) => rule.mins > 0 && (
                <div key={`time-${idx}`} className="flex justify-between items-center text-sm pt-2 border-t border-blue-500/30">
                  <span className="text-blue-100">{rule.name}</span>
                  <div className="text-right">
                    <span className="block font-medium">+{rule.pay >= 0 ? '' : ''}¥{rule.pay.toLocaleString()}</span>
                    <span className="text-xs text-blue-200">{formatHours(rule.mins)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={saveRecord}
                className="w-full py-3 px-4 bg-white text-blue-600 hover:bg-blue-50 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-5 h-5" />
                保存する
              </button>
              <button
                onClick={exportToCSV}
                className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-5 h-5" />
                CSV出力
              </button>
            </div>
          </div>
        )}
        </div>
        )}

        {activeTab === 'monthly' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* 月選択 */}
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-lg font-bold text-gray-800">
                {monthlyData.year}年 {monthlyData.month}月
              </h2>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* サマリーカード */}
            <div className="bg-blue-600 rounded-2xl shadow-lg p-6 text-white text-center">
              <p className="text-blue-100 text-sm font-medium mb-1">月間合計給与</p>
              <div className="text-4xl font-bold tracking-tight">
                ¥{monthlyData.totalPay.toLocaleString()}
              </div>
              <p className="text-blue-200 text-sm mt-2">
                月間総労働時間: {formatHours(monthlyData.totalMins)}
              </p>
            </div>

            {/* グラフ */}
            {allMonthsChartData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-medium text-gray-700 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gray-500" />
                  月別給与推移
                </h3>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={allMonthsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(value) => `¥${value.toLocaleString()}`} width={60} />
                      <Tooltip
                        formatter={(value: number) => [`¥${value.toLocaleString()}`, '給与']}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.month || label}
                        labelStyle={{ color: '#374151', fontWeight: 500, marginBottom: '4px' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 記録リスト */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  勤務記録 ({monthlyData.monthRecords.length}件)
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {monthlyData.monthRecords.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    この月の記録はありません
                  </div>
                ) : (
                  monthlyData.monthRecords.map(([date, data]) => (
                    <div key={date} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="font-medium text-gray-900">{date}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          労働: {formatHours(data.workedMins)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="font-bold text-gray-900">
                          ¥{data.totalPay.toLocaleString()}
                        </div>
                        <button
                          onClick={() => deleteRecord(date)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm animate-in fade-in slide-in-from-bottom-4 z-50 whitespace-nowrap">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
