import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { 
  ArrowLeft, CheckCircle2, XCircle, Clock, TrendingUp, 
  Loader2, Target, Calendar
} from 'lucide-react';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const data = await analyticsApi.getAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Tasks',
      value: analytics?.total_tasks || 0,
      icon: Calendar,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      title: 'Completed',
      value: analytics?.completed_tasks || 0,
      icon: CheckCircle2,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Missed',
      value: analytics?.missed_tasks || 0,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10'
    },
    {
      title: 'Pending',
      value: analytics?.pending_tasks || 0,
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            data-testid="back-to-dashboard-btn"
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">Your productivity overview</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Completion Rate Card */}
        <Card className="glass border-white/5 overflow-hidden" data-testid="completion-rate-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
          <CardHeader className="relative">
            <CardDescription>Completion Rate</CardDescription>
            <CardTitle className="text-5xl font-bold tracking-tight">
              {analytics?.completion_rate || 0}%
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <Progress 
              value={analytics?.completion_rate || 0} 
              className="h-3"
            />
            <p className="text-sm text-muted-foreground mt-3">
              {analytics?.completed_tasks || 0} of {analytics?.total_tasks || 0} tasks completed
            </p>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <Card 
              key={stat.title}
              className="glass border-white/5"
              data-testid={`stat-card-${stat.title.toLowerCase().replace(' ', '-')}`}
            >
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-xl ${stat.bgColor} flex items-center justify-center mb-3`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Insights Card */}
        <Card className="glass border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Quick Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics?.total_tasks === 0 ? (
              <p className="text-muted-foreground">
                Start adding tasks to see your productivity insights here.
              </p>
            ) : (
              <>
                {analytics?.completion_rate >= 80 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10">
                    <Target className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-500">Great Progress!</p>
                      <p className="text-sm text-muted-foreground">
                        You're crushing it with a {analytics.completion_rate}% completion rate.
                      </p>
                    </div>
                  </div>
                )}
                {analytics?.completion_rate < 50 && analytics?.completion_rate > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10">
                    <Target className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-500">Room for Improvement</p>
                      <p className="text-sm text-muted-foreground">
                        Try breaking larger tasks into smaller ones to boost completion.
                      </p>
                    </div>
                  </div>
                )}
                {analytics?.missed_tasks > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-500">{analytics.missed_tasks} Tasks Missed</p>
                      <p className="text-sm text-muted-foreground">
                        Consider rescheduling missed tasks from the dashboard.
                      </p>
                    </div>
                  </div>
                )}
                {analytics?.pending_tasks > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-primary">{analytics.pending_tasks} Tasks Pending</p>
                      <p className="text-sm text-muted-foreground">
                        Stay focused and tackle them one at a time!
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
