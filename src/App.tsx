import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  Settings as SettingsIcon, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Receipt,
  Trash2,
  ChevronRight,
  Filter,
  Calendar,
  Camera,
  Loader2,
  Upload,
  Download,
  Database,
  AlertTriangle,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  User as UserIcon,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { Business, Expense, Sale, Settings, FinancialData, ExpenseCategory, PaymentMethod } from './types';
import { auth, db } from './lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// --- Constants ---
const SHARED_DOC_ID = "mc_cha_shared_v1";
const MC_COLOR = {
  bg: 'bg-orange-50',
  border: 'border-orange-200',
  text: 'text-orange-900',
  accent: 'bg-orange-500',
  hover: 'hover:bg-orange-100'
};

const CHA_COLOR = {
  bg: 'bg-green-50',
  border: 'border-green-200',
  text: 'text-green-900',
  accent: 'bg-green-500',
  hover: 'hover:bg-green-100'
};

// --- Helper Functions ---
const formatCurrency = (value: number) => 
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);

const formatDate = (dateString: string) => 
  new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, icon: Icon, colorClass, subtitle }: any) => (
  <Card className="p-6">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className={`text-2xl font-bold ${colorClass}`}>{value}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-xl ${colorClass.replace('text-', 'bg-').replace('900', '100')}`}>
        <Icon className={`w-6 h-6 ${colorClass}`} />
      </div>
    </div>
  </Card>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entry' | 'history' | 'settings'>('dashboard');
  const [isSyncing, setIsSyncing] = useState(true);
  const [data, setData] = useState<FinancialData>(() => {
    const saved = localStorage.getItem('mc_cha_financial_data');
    if (saved) return JSON.parse(saved);
    return {
      expenses: [],
      sales: [],
      settings: { internalChargePrice: 15 } // Default price
    };
  });

  // Firestore Sync Listener (Shared Mode)
  useEffect(() => {
    setIsSyncing(true);
    const docRef = doc(db, "shared_data", SHARED_DOC_ID);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data() as FinancialData;
        // Only update if cloud data is different to avoid loops
        setData(cloudData);
      } else {
        // Initial upload if cloud is empty
        setDoc(docRef, data);
      }
      setIsSyncing(false);
    }, (error) => {
      console.error("Firestore Sync Error:", error);
      setIsSyncing(false);
    });

    return () => unsubscribe();
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('mc_cha_financial_data', JSON.stringify(data));
    
    // Push to cloud automatically
    if (!isSyncing) {
      const docRef = doc(db, "shared_data", SHARED_DOC_ID);
      setDoc(docRef, data).catch(err => console.error("Error pushing to cloud:", err));
    }
  }, [data]);

  // --- Calculations ---
  const filteredData = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return {
      expenses: data.expenses.filter(e => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month - 1;
      }),
      sales: data.sales.filter(s => {
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() === month - 1;
      })
    };
  }, [data, selectedMonth]);

  const stats = useMemo(() => {
    const calc = (business: Business) => {
      const bSales = filteredData.sales.filter(s => s.business === business);
      const bExpenses = filteredData.expenses.filter(e => e.business === business);
      
      const totalSales = bSales.reduce((sum, s) => sum + s.amount, 0);
      const totalTickets = bSales.reduce((sum, s) => sum + (s.ticketsSold || 0), 0);
      
      const foodCost = bExpenses.filter(e => e.category === 'Food Cost').reduce((sum, e) => sum + e.amount, 0);
      const operatingCost = bExpenses.filter(e => e.category === 'Operating').reduce((sum, e) => sum + e.amount, 0);
      const personnelCost = bExpenses.filter(e => e.category === 'Personnel').reduce((sum, e) => sum + e.amount, 0);
      
      const totalExpenses = foodCost + operatingCost + personnelCost;
      const ebitda = totalSales - totalExpenses;

      return { totalSales, totalTickets, foodCost, operatingCost, personnelCost, totalExpenses, ebitda };
    };

    const mc = calc('MC');
    const cha = calc('CHA');

    // Internal Invoice
    const internalInvoice = cha.totalTickets * data.settings.internalChargePrice;
    
    // Adjusted EBITDA
    const mcAdjustedEbitda = mc.ebitda + internalInvoice;
    const chaAdjustedEbitda = cha.ebitda - internalInvoice;

    return { mc, cha, internalInvoice, mcAdjustedEbitda, chaAdjustedEbitda };
  }, [filteredData, data.settings.internalChargePrice]);

  // --- Actions ---
  const addExpense = (expense: Omit<Expense, 'id'>) => {
    setData(prev => ({
      ...prev,
      expenses: [...prev.expenses, { ...expense, id: crypto.randomUUID() }]
    }));
  };

  const addSale = (sale: Omit<Sale, 'id'>) => {
    setData(prev => ({
      ...prev,
      sales: [...prev.sales, { ...sale, id: crypto.randomUUID() }]
    }));
  };

  const deleteEntry = (id: string, type: 'expense' | 'sale') => {
    setData(prev => ({
      ...prev,
      [type === 'expense' ? 'expenses' : 'sales']: prev[type === 'expense' ? 'expenses' : 'sales'].filter(item => item.id !== id)
    }));
  };

  const updateSettings = (settings: Settings) => {
    setData(prev => ({ ...prev, settings }));
  };

  const handleBackup = () => {
    const backupData = { ...data, lastBackupDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mc_cha_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setData(backupData);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (confirm('¿Estás seguro de que quieres restaurar esta copia de seguridad? Los datos actuales serán reemplazados.')) {
          setData(importedData);
          alert('Copia de seguridad restaurada con éxito.');
        }
      } catch (err) {
        alert('Error al leer el archivo de copia de seguridad.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const daysSinceBackup = useMemo(() => {
    if (!data.lastBackupDate) return Infinity;
    const last = new Date(data.lastBackupDate).getTime();
    const now = new Date().getTime();
    return Math.floor((now - last) / (1000 * 60 * 60 * 24));
  }, [data.lastBackupDate]);

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 overflow-x-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-700 flex items-center justify-between px-4 z-50 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">MC</div>
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">CHA</div>
          <span className="text-white font-bold text-sm ml-1">Gestión</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-white hover:bg-slate-600 rounded-lg transition-colors"
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-700 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-slate-600/50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-orange-900/20">MC</div>
              <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-green-900/20">CHA</div>
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">Gestión Real-Time</h1>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-white text-slate-900 shadow-lg shadow-black/10' : 'text-slate-200 hover:bg-slate-600'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Cuadro de Mando</span>
          </button>
          <button 
            onClick={() => { setActiveTab('entry'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'entry' ? 'bg-white text-slate-900 shadow-lg shadow-black/10' : 'text-slate-200 hover:bg-slate-600'}`}
          >
            <PlusCircle size={20} />
            <span className="font-medium">Entrada de Datos</span>
          </button>
          <button 
            onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-lg shadow-black/10' : 'text-slate-200 hover:bg-slate-600'}`}
          >
            <History size={20} />
            <span className="font-medium">Historial</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-600/50">
          <div className="flex items-center gap-3 px-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${isSyncing ? 'bg-slate-600 border-slate-500' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
              {isSyncing ? <Loader2 size={16} className="animate-spin text-slate-400" /> : <Cloud size={16} className="text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-white uppercase tracking-wider">Sincronización</p>
              <p className="text-[9px] text-slate-400 truncate flex items-center gap-1 uppercase font-bold tracking-tighter">
                {isSyncing ? 'Actualizando...' : 'Nube Conectada'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-600/50">
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-600/30">
            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Mes de Análisis</p>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium cursor-pointer text-white"
            />
          </div>
        </div>

        <div className="p-4 text-center border-t border-slate-600/50">
          <a 
            href="https://smileconsultores.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-[10px] text-slate-300 hover:text-white transition-colors font-medium tracking-wide"
          >
            <img 
              src="https://www.smileconsultores.com/gallery_gen/26aadff78e30f843ca5b6d8211c014d2_163x160.9625.png" 
              alt="smileconsultores logo" 
              className="h-6 w-auto transition-all brightness-0 invert opacity-80 hover:opacity-100"
              referrerPolicy="no-referrer"
            />
            Hand made by smileconsultores
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto mt-16 lg:mt-0">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Cuadro de Mando</h2>
                  <p className="text-slate-500">Resumen financiero consolidado para {selectedMonth}</p>
                </div>
                <div className="flex gap-4">
                  <div className="px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-bold flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div> Mesón MC
                  </div>
                  <div className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-bold flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div> Turismo CHA
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* MC Section */}
                <section className="space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-orange-900">
                    <div className="w-2 h-6 bg-orange-500 rounded-full"></div> Mesón MC
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard title="Ventas MC" value={formatCurrency(stats.mc.totalSales)} icon={TrendingUp} colorClass="text-orange-900" />
                    <StatCard title="Gastos MC" value={formatCurrency(stats.mc.totalExpenses)} icon={TrendingDown} colorClass="text-orange-900" subtitle={`Food Cost: ${formatCurrency(stats.mc.foodCost)}`} />
                    <StatCard title="EBITDA Provisional" value={formatCurrency(stats.mc.ebitda)} icon={TrendingUp} colorClass={stats.mc.ebitda >= 0 ? "text-emerald-600" : "text-rose-600"} />
                    <StatCard title="EBITDA Ajustado" value={formatCurrency(stats.mcAdjustedEbitda)} icon={TrendingUp} colorClass={stats.mcAdjustedEbitda >= 0 ? "text-emerald-600" : "text-rose-600"} subtitle="Tras factura interna" />
                  </div>
                </section>

                {/* CHA Section */}
                <section className="space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-green-900">
                    <div className="w-2 h-6 bg-green-500 rounded-full"></div> Turismo CHA
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard title="Ventas CHA" value={formatCurrency(stats.cha.totalSales)} icon={TrendingUp} colorClass="text-green-900" subtitle={`${stats.cha.totalTickets} entradas`} />
                    <StatCard title="Gastos CHA" value={formatCurrency(stats.cha.totalExpenses)} icon={TrendingDown} colorClass="text-green-900" />
                    <StatCard title="EBITDA Provisional" value={formatCurrency(stats.cha.ebitda)} icon={TrendingUp} colorClass={stats.cha.ebitda >= 0 ? "text-emerald-600" : "text-rose-600"} />
                    <StatCard title="EBITDA Ajustado" value={formatCurrency(stats.chaAdjustedEbitda)} icon={TrendingUp} colorClass={stats.chaAdjustedEbitda >= 0 ? "text-emerald-600" : "text-rose-600"} subtitle="Tras factura interna" />
                  </div>
                </section>
              </div>

              {/* Internal Settlement */}
              <Card className="bg-slate-900 text-white p-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Receipt className="text-orange-400" /> Liquidación Interna
                    </h3>
                    <p className="text-slate-400 max-w-md">Cálculo de la factura probable de MC a CHA por cesión de sala y degustaciones.</p>
                  </div>
                  <div className="flex gap-12 items-center">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Turistas</p>
                      <p className="text-3xl font-bold">{stats.cha.totalTickets}</p>
                    </div>
                    <div className="text-slate-700 text-2xl">×</div>
                    <div className="text-center">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Precio/Pax</p>
                      <p className="text-3xl font-bold">{formatCurrency(data.settings.internalChargePrice)}</p>
                    </div>
                    <div className="text-slate-700 text-2xl">=</div>
                    <div className="bg-white/10 px-6 py-4 rounded-2xl text-center border border-white/5">
                      <p className="text-xs text-orange-400 uppercase font-bold tracking-widest mb-1">Total Factura</p>
                      <p className="text-4xl font-black text-orange-400">{formatCurrency(stats.internalInvoice)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'entry' && (
            <motion.div 
              key="entry"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* MC Entry */}
                <DataEntryForm 
                  business="MC" 
                  color={MC_COLOR} 
                  onAddExpense={addExpense} 
                  onAddSale={addSale} 
                />
                
                {/* CHA Entry */}
                <DataEntryForm 
                  business="CHA" 
                  color={CHA_COLOR} 
                  onAddExpense={addExpense} 
                  onAddSale={addSale} 
                />
              </div>

              {/* Settings and Danger Zone at the bottom of Entry tab */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <SettingsIcon className="text-slate-400" size={20} /> Configuración de Negocio
                  </h3>
                  <div className="space-y-4">
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-500">Precio Cesión Sala y Degustación (€/pax)</label>
                    <div className="flex gap-4">
                      <input 
                        type="number" 
                        value={data.settings.internalChargePrice}
                        onChange={(e) => updateSettings({ ...data.settings, internalChargePrice: Number(e.target.value) })}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold"
                      />
                      <div className="px-6 py-3 bg-slate-100 rounded-xl font-bold text-slate-500 flex items-center">
                        € / Pax
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-bold tracking-tight">Este valor recalcula automáticamente la factura interna de MC a CHA en el Cuadro de Mando.</p>
                  </div>
                </Card>

                <Card className="p-8 border-rose-100 bg-rose-50/30">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-rose-600">
                    <Trash2 className="text-rose-400" size={20} /> Zona de Peligro
                  </h3>
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 font-medium">Borra todos los datos almacenados localmente de forma permanente.</p>
                    <button 
                      onClick={() => {
                        if (confirm('¿Estás seguro de que quieres borrar todos los datos? Esta acción no se puede deshacer.')) {
                          setData({ expenses: [], sales: [], settings: { internalChargePrice: 15 } });
                          localStorage.removeItem('mc_cha_financial_data');
                        }
                      }}
                      className="w-full px-6 py-4 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
                    >
                      <Trash2 size={18} /> Borrar todos los datos
                    </button>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Historial de Transacciones</h2>
                  <p className="text-slate-500">Listado detallado de ingresos y gastos para {selectedMonth}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {daysSinceBackup > 15 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 text-xs font-bold animate-pulse">
                      <AlertTriangle size={14} />
                      {data.lastBackupDate ? `Última copia hace ${daysSinceBackup} días` : 'Sin copia de seguridad'}
                    </div>
                  )}
                  
                  <button 
                    onClick={handleBackup}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md"
                  >
                    <Download size={16} /> Copia de Seguridad
                  </button>
                  
                  <label className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
                    <Database size={16} /> Restaurar Copia
                    <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
                  </label>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <HistoryList 
                  business="MC" 
                  color={MC_COLOR} 
                  expenses={filteredData.expenses.filter(e => e.business === 'MC')} 
                  sales={filteredData.sales.filter(s => s.business === 'MC')} 
                  onDelete={deleteEntry}
                />
                <HistoryList 
                  business="CHA" 
                  color={CHA_COLOR} 
                  expenses={filteredData.expenses.filter(e => e.business === 'CHA')} 
                  sales={filteredData.sales.filter(s => s.business === 'CHA')} 
                  onDelete={deleteEntry}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function DataEntryForm({ business, color, onAddExpense, onAddSale }: any) {
  const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const [type, setType] = useState<'expense' | 'sale'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [category, setCategory] = useState<ExpenseCategory>('Operating');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Domiciled');
  const [tickets, setTickets] = useState('');
  const [description, setDescription] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);

  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: "Extract the taxable base (base imponible) as a number and the supplier name (proveedor) from this invoice/receipt. Return ONLY a JSON object with keys 'amount' (number) and 'supplier' (string). If you can't find them, return null for those values." }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              supplier: { type: Type.STRING }
            }
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      if (result.amount) setAmount(String(result.amount));
      if (result.supplier) setDescription(result.supplier);
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Error al escanear la factura. Por favor, inténtalo de nuevo.");
    } finally {
      setIsScanning(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;

    if (type === 'expense') {
      onAddExpense({
        date,
        amount: Number(amount),
        category,
        paymentMethod,
        business,
        description
      });
    } else {
      onAddSale({
        date,
        endDate: isRange ? endDate : undefined,
        amount: Number(amount),
        business,
        ticketsSold: business === 'CHA' ? Number(tickets) : undefined
      });
    }

    setAmount('');
    setTickets('');
    setDescription('');
    setEndDate('');
    setIsRange(false);
    setDate(getTodayStr()); // Reset to today
  };

  return (
    <Card className={`${color.bg} border-2 ${color.border} p-8`}>
      <div className="flex items-center justify-between mb-8">
        <h3 className={`text-2xl font-black ${color.text}`}>Entrada {business}</h3>
        <div className="flex bg-white/50 p-1 rounded-xl border border-slate-200">
          <button 
            onClick={() => setType('expense')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${type === 'expense' ? `${color.accent} text-white shadow-md` : 'text-slate-500 hover:bg-white'}`}
          >
            Gasto
          </button>
          <button 
            onClick={() => setType('sale')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${type === 'sale' ? `${color.accent} text-white shadow-md` : 'text-slate-500 hover:bg-white'}`}
          >
            Venta
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {business === 'MC' && type === 'expense' && (
          <div className="bg-white/40 border border-dashed border-orange-300 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 transition-all hover:bg-white/60">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${color.accent} text-white`}>
                {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-700">Escaneo OCR Inteligente</p>
                <p className="text-xs text-slate-500">Sube tu factura para autorrellenar importe y proveedor</p>
              </div>
            </div>
            <label className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${isScanning ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : `${color.accent} text-white hover:brightness-110 shadow-sm`}`}>
              {isScanning ? 'Escaneando...' : 'Seleccionar Factura'}
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleOCR} 
                disabled={isScanning}
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {type === 'sale' && (
            <div className="col-span-2 flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id={`${business}-isRange`}
                checked={isRange} 
                onChange={(e) => setIsRange(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <label htmlFor={`${business}-isRange`} className="text-xs font-bold text-slate-600 uppercase tracking-widest cursor-pointer">¿Es un periodo (rango de fechas)?</label>
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Importe (€)</label>
            <input 
              type="number" 
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 rounded-2xl border-none bg-white shadow-inner text-2xl font-bold focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{isRange ? 'Fecha Inicio' : 'Fecha'}</label>
            <input 
              type="date" 
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>

          {isRange && type === 'sale' && (
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Fecha Fin</label>
              <input 
                type="date" 
                required={isRange}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
          )}

          {type === 'expense' ? (
            <>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Categoría</label>
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  {business === 'MC' && <option value="Food Cost">Food Cost</option>}
                  <option value="Operating">Explotación</option>
                  <option value="Personnel">Personal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Pago</label>
                <select 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="Domiciled">Domiciliado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Descripción (Opcional)</label>
                <input 
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Factura Luz"
                  className="w-full px-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
            </>
          ) : (
            business === 'CHA' && (
              <div className="col-span-2">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Entradas Vendidas</label>
                <input 
                  type="number" 
                  value={tickets}
                  onChange={(e) => setTickets(e.target.value)}
                  placeholder="Número de turistas"
                  className="w-full px-4 py-3 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
            )
          )}
        </div>

        <button 
          type="submit"
          className={`w-full py-4 rounded-2xl text-white font-black uppercase tracking-widest shadow-lg transition-all active:scale-[0.98] ${color.accent} hover:brightness-110`}
        >
          Registrar {type === 'expense' ? 'Gasto' : 'Venta'}
        </button>
      </form>
    </Card>
  );
}

function HistoryList({ business, color, expenses, sales, onDelete }: any) {
  const [filter, setFilter] = useState<'all' | 'expense' | 'sale'>('all');

  const items = useMemo(() => {
    const all = [
      ...expenses.map((e: any) => ({ ...e, type: 'expense' })),
      ...sales.map((s: any) => ({ ...s, type: 'sale' }))
    ];
    return all
      .filter(item => filter === 'all' || item.type === filter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, sales, filter]);

  return (
    <Card className="flex flex-col h-[600px]">
      <div className={`p-6 border-b border-slate-100 flex items-center justify-between ${color.bg}`}>
        <h3 className={`font-black uppercase tracking-widest ${color.text}`}>{business}</h3>
        <div className="flex gap-2">
          <button onClick={() => setFilter('all')} className={`p-2 rounded-lg text-xs font-bold ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>Todos</button>
          <button onClick={() => setFilter('expense')} className={`p-2 rounded-lg text-xs font-bold ${filter === 'expense' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>Gastos</button>
          <button onClick={() => setFilter('sale')} className={`p-2 rounded-lg text-xs font-bold ${filter === 'sale' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>Ventas</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
            <History size={48} strokeWidth={1} />
            <p className="text-sm font-medium">No hay registros este mes</p>
          </div>
        ) : (
          items.map((item: any) => (
            <div key={item.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.type === 'sale' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                  {item.type === 'sale' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${item.type === 'sale' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {item.type === 'sale' ? 'Venta' : item.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> 
                      {formatDate(item.date)}
                      {item.endDate && ` - ${formatDate(item.endDate)}`}
                    </span>
                    {item.paymentMethod && <span className="flex items-center gap-1"><Receipt size={12} /> {item.paymentMethod}</span>}
                    {item.ticketsSold && <span className="flex items-center gap-1"><Users size={12} /> {item.ticketsSold} pax</span>}
                  </div>
                  {item.description && <p className="text-xs text-slate-500 mt-1 italic">"{item.description}"</p>}
                </div>
              </div>
              <button 
                onClick={() => onDelete(item.id, item.type)}
                className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
