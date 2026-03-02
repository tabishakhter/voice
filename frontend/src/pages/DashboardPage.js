import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useNotifications } from '../hooks/useNotifications';
import { taskApi, usageApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { 
  Mic, MicOff, Sun, Moon, LogOut, BarChart3, Calendar, 
  Trash2, Edit3, CheckCircle2, Clock, AlertCircle, Loader2,
  ChevronRight, Send, X, Bell
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, parseISO, isBefore, addMinutes } from 'date-fns';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isListening, transcript, startListening, stopListening, resetTranscript, isSupported } = useSpeechRecognition();
  const { requestPermission, notifyTask, isGranted } = useNotifications();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Input states
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Edit modal states
  const [editTask, setEditTask] = useState(null);
  const [editName, setEditName] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editDuration, setEditDuration] = useState('');

  // Voice input overlay
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);

  // Load tasks and usage
  const loadData = useCallback(async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const [tasksData, usageData] = await Promise.all([
        taskApi.getTasks(dateStr),
        usageApi.getUsage()
      ]);
      setTasks(tasksData);
      setUsage(usageData);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Request notification permission on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Check for due tasks every minute
  useEffect(() => {
    const checkDueTasks = () => {
      const now = new Date();
      tasks.forEach(task => {
        if (task.status === 'pending') {
          const taskTime = parseISO(task.scheduled_time);
          const timeDiff = Math.abs(now.getTime() - taskTime.getTime());
          // Notify if task is due within 1 minute
          if (timeDiff < 60000 && isBefore(taskTime, addMinutes(now, 1))) {
            notifyTask(task);
          }
        }
      });
    };

    const interval = setInterval(checkDueTasks, 30000);
    return () => clearInterval(interval);
  }, [tasks, notifyTask]);

  // Handle voice input
  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
      if (transcript) {
        processVoiceInput(transcript);
      }
    } else {
      resetTranscript();
      setShowVoiceOverlay(true);
      startListening();
    }
  };

  const closeVoiceOverlay = () => {
    stopListening();
    setShowVoiceOverlay(false);
    if (transcript) {
      setTextInput(transcript);
    }
    resetTranscript();
  };

  const confirmVoiceInput = () => {
    stopListening();
    if (transcript) {
      processVoiceInput(transcript);
    }
    setShowVoiceOverlay(false);
    resetTranscript();
  };

  // Process voice/text input with AI
  const processVoiceInput = async (text) => {
    if (!text.trim()) return;
    
    setIsProcessing(true);
    try {
      const parsed = await taskApi.parseTask(text);
      
      if (parsed.scheduled_time) {
        // Create task directly
        await taskApi.createTask({
          name: parsed.name,
          scheduled_time: parsed.scheduled_time,
          duration_minutes: parsed.duration_minutes,
          priority: parsed.priority
        });
        toast.success(`Task "${parsed.name}" created!`);
        await loadData();
        await refreshUser();
      } else {
        // Open edit modal to set time manually
        setEditTask({ isNew: true });
        setEditName(parsed.name);
        setEditTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setEditPriority(parsed.priority);
        setEditDuration(parsed.duration_minutes?.toString() || '');
      }
      
      setTextInput('');
    } catch (error) {
      if (error.response?.status === 429) {
        toast.error('Daily AI limit reached (15/day)');
      } else {
        toast.error('Failed to process input');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle text input submit
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput.trim()) {
      processVoiceInput(textInput);
    }
  };

  // Task actions
  const handleCompleteTask = async (task) => {
    try {
      await taskApi.updateTask(task.id, { status: 'completed' });
      toast.success('Task completed!');
      loadData();
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  const handleMissTask = async (task) => {
    try {
      await taskApi.updateTask(task.id, { status: 'missed' });
      loadData();
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (task) => {
    try {
      await taskApi.deleteTask(task.id);
      toast.success('Task deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const handleEditClick = (task) => {
    setEditTask(task);
    setEditName(task.name);
    setEditTime(task.scheduled_time.slice(0, 16));
    setEditPriority(task.priority);
    setEditDuration(task.duration_minutes?.toString() || '');
  };

  const handleSaveEdit = async () => {
    try {
      if (editTask.isNew) {
        await taskApi.createTask({
          name: editName,
          scheduled_time: new Date(editTime).toISOString(),
          duration_minutes: editDuration ? parseInt(editDuration) : null,
          priority: editPriority
        });
        toast.success('Task created!');
      } else {
        await taskApi.updateTask(editTask.id, {
          name: editName,
          scheduled_time: new Date(editTime).toISOString(),
          duration_minutes: editDuration ? parseInt(editDuration) : null,
          priority: editPriority
        });
        toast.success('Task updated!');
      }
      setEditTask(null);
      loadData();
    } catch (error) {
      toast.error('Failed to save task');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Group tasks by time of day
  const groupedTasks = tasks.reduce((acc, task) => {
    const hour = parseInt(task.scheduled_time.slice(11, 13));
    let period = 'Morning';
    if (hour >= 12 && hour < 17) period = 'Afternoon';
    else if (hour >= 17) period = 'Evening';
    
    if (!acc[period]) acc[period] = [];
    acc[period].push(task);
    return acc;
  }, {});

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-500 border-green-500/30">Done</Badge>;
      case 'missed':
        return <Badge variant="outline" className="text-red-500 border-red-500/30">Missed</Badge>;
      default:
        return <Badge variant="outline" className="text-primary border-primary/30">Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">TaskVoice</h1>
            <p className="text-sm text-muted-foreground">
              {format(selectedDate, 'EEEE, MMM d')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="theme-toggle-btn"
              className="rounded-full"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/analytics')}
              data-testid="analytics-btn"
              className="rounded-full"
            >
              <BarChart3 className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="logout-btn"
              className="rounded-full"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Usage Stats */}
        {usage && (
          <Card className="mb-6 glass border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">AI Requests Today</span>
                <span className="text-sm font-medium">
                  {usage.ai_requests_today}/{usage.ai_requests_limit}
                </span>
              </div>
              <Progress 
                value={(usage.ai_requests_today / usage.ai_requests_limit) * 100} 
                className="h-2"
              />
            </CardContent>
          </Card>
        )}

        {/* Notification Permission Banner */}
        {!isGranted && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-primary" />
                <span className="text-sm">Enable notifications for reminders</span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={requestPermission}
                data-testid="enable-notifications-btn"
              >
                Enable
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tasks Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No tasks for today</h3>
            <p className="text-muted-foreground text-sm">
              Tap the mic button or type to add a task
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {['Morning', 'Afternoon', 'Evening'].map(period => {
              const periodTasks = groupedTasks[period];
              if (!periodTasks?.length) return null;

              return (
                <div key={period}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    {period}
                  </h2>
                  <div className="relative pl-6">
                    {/* Timeline line */}
                    <div className="absolute left-2 top-2 bottom-2 w-0.5 timeline-line" />
                    
                    <div className="space-y-4">
                      {periodTasks.map((task, index) => (
                        <div 
                          key={task.id}
                          className="relative animate-slide-up"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          {/* Timeline dot */}
                          <div className={`absolute -left-4 top-4 w-3 h-3 rounded-full border-2 border-background ${getPriorityColor(task.priority)}`} />
                          
                          <Card 
                            className="task-card glass border-white/5 overflow-hidden"
                            data-testid={`task-card-${task.id}`}
                          >
                            {/* Priority indicator */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${getPriorityColor(task.priority)}`} />
                            
                            <CardContent className="p-4 pl-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Clock className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                      {format(parseISO(task.scheduled_time), 'h:mm a')}
                                    </span>
                                    {task.duration_minutes && (
                                      <span className="text-xs text-muted-foreground">
                                        ({task.duration_minutes}min)
                                      </span>
                                    )}
                                  </div>
                                  <h3 className={`font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                                    {task.name}
                                  </h3>
                                  <div className="mt-2">
                                    {getStatusBadge(task.status)}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  {task.status === 'pending' && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleCompleteTask(task)}
                                      data-testid={`complete-task-${task.id}`}
                                      className="h-9 w-9 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                    >
                                      <CheckCircle2 className="w-5 h-5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditClick(task)}
                                    data-testid={`edit-task-${task.id}`}
                                    className="h-9 w-9"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteTask(task)}
                                    data-testid={`delete-task-${task.id}`}
                                    className="h-9 w-9 text-destructive hover:text-red-400 hover:bg-red-500/10"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 safe-area-inset-bottom">
        <form 
          onSubmit={handleTextSubmit}
          className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3"
        >
          <Input
            type="text"
            placeholder="Type a task... (e.g., Gym at 9pm)"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isProcessing}
            data-testid="task-text-input"
            className="flex-1 h-12 bg-secondary/50 rounded-xl"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!textInput.trim() || isProcessing}
            data-testid="submit-text-btn"
            className="h-12 w-12 rounded-xl"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </form>
      </div>

      {/* Floating Mic Button */}
      <button
        onClick={handleVoiceToggle}
        disabled={!isSupported || isProcessing}
        data-testid="voice-input-btn"
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg z-50 transition-transform active:scale-95 ${isListening ? 'listening-pulse' : 'mic-glow'}`}
      >
        {isListening ? (
          <MicOff className="w-7 h-7 text-white" />
        ) : (
          <Mic className="w-7 h-7 text-white" />
        )}
      </button>

      {/* Voice Input Overlay */}
      {showVoiceOverlay && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-6">
          <button
            onClick={closeVoiceOverlay}
            className="absolute top-6 right-6 p-2"
            data-testid="close-voice-overlay"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-2">Listening...</h2>
            <p className="text-muted-foreground">Say your task aloud</p>
          </div>

          {/* Sound wave visualization */}
          <div className="flex items-center justify-center gap-1 mb-12 h-16">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`w-2 bg-primary rounded-full sound-wave-bar ${!isListening ? 'h-2' : ''}`}
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>

          {/* Transcript display */}
          <div className="w-full max-w-md">
            <Card className="glass border-white/5">
              <CardContent className="p-6">
                <p className="text-lg text-center min-h-[60px]">
                  {transcript || 'Start speaking...'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Confirm button */}
          <div className="mt-8 flex gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={closeVoiceOverlay}
              data-testid="cancel-voice-btn"
              className="px-8"
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={confirmVoiceInput}
              disabled={!transcript}
              data-testid="confirm-voice-btn"
              className="px-8"
            >
              Add Task
            </Button>
          </div>
        </div>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={!!editTask} onOpenChange={() => setEditTask(null)}>
        <DialogContent className="glass border-white/10">
          <DialogHeader>
            <DialogTitle>{editTask?.isNew ? 'Create Task' : 'Edit Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Task Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="edit-task-name-input"
                className="h-12 bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-time">Scheduled Time</Label>
              <Input
                id="edit-time"
                type="datetime-local"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                data-testid="edit-task-time-input"
                className="h-12 bg-secondary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger data-testid="edit-task-priority-select" className="h-12 bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-duration">Duration (min)</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  placeholder="Optional"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  data-testid="edit-task-duration-input"
                  className="h-12 bg-secondary/50"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} data-testid="save-task-btn">
              {editTask?.isNew ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
