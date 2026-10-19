import { useEffect, useState } from 'react'
import { Clock3, RefreshCw } from 'lucide-react'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '../api'
import { DataState, PageHeading } from '../components/DataState'
import { useAdminData } from '../hooks/useAdminData'
import { formatDate, formatNumber } from '../../../shared/format'
import type { YouTubeUsage } from '../types'

function QuotaCard({ title, bucket }: { title: string; bucket: YouTubeUsage['buckets']['search'] }) {
  const warning = bucket.percent >= 80
  return <Card>
    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
      <CardTitle>{title}</CardTitle>
      <Badge variant={warning ? 'destructive' : 'secondary'}>{bucket.percent >= 100 ? '한도 도달' : warning ? '80% 이상 사용' : '추정 사용량'}</Badge>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-3xl font-semibold tabular-nums">{formatNumber(bucket.used)}</span><span className="text-sm text-muted-foreground">/ {formatNumber(bucket.limit)} 단위</span></div>
      <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(bucket.percent))}
        aria-valuetext={`${bucket.percent.toFixed(1)}% 사용`} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${warning ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.min(100, bucket.percent)}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">{bucket.percent.toFixed(1)}% 사용 · 잔여 약 {formatNumber(bucket.remaining)} 단위</p>
    </CardContent>
  </Card>
}

export function YouTubeUsagePage() {
  const { data, loading, error, reload } = useAdminData(adminApi.youtubeUsage, 30_000)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const remaining = data ? Math.max(0, Math.ceil((data.resetsAt - now) / 60_000)) : 0
  return <>
    <PageHeading title="YouTube 사용량" description="B-SIDE가 보낸 API 요청으로 일일 할당량 사용을 추정합니다."
      action={<Button variant="outline" size="sm" onClick={reload}><RefreshCw aria-hidden="true" /> 새로고침</Button>} />
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Badge variant="outline">{data.day} · 태평양 시간</Badge>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="size-4" aria-hidden="true" />{remaining === 0 ? '초기화 확인 중' : `${Math.floor(remaining / 60)}시간 ${remaining % 60}분 후 초기화`}</span>
          <span>마지막 갱신 {formatDate(data.generatedAt)}</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <QuotaCard title="검색 할당량" bucket={data.buckets.search} />
          <QuotaCard title="일반 조회 할당량" bucket={data.buckets.data} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['오늘 API 요청', data.totals.requests], ['실패한 요청', data.totals.errors], ['할당량·요청 제한 오류', data.totals.quotaErrors],
          ].map(([label, value]) => <Card key={label} size="sm"><CardHeader><CardDescription>{label}</CardDescription></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{formatNumber(Number(value))}</CardContent></Card>)}
        </div>
        {data.totals.lastQuotaErrorAt && <p role="status" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">마지막 할당량·요청 제한 오류: {formatDate(data.totals.lastQuotaErrorAt)}</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          {([
            ['searchUnits', '검색 할당량 추이'], ['dataUnits', '일반 조회 할당량 추이'],
          ] as const).map(([key, title]) => <Card key={key}>
            <CardHeader><CardTitle>{title}</CardTitle><CardDescription>최근 7일 · 태평양 날짜 기준 · 단위</CardDescription></CardHeader>
            <CardContent>
              <ChartContainer config={{ [key]: { label: title, color: 'var(--chart-2)' } }} className="h-52 w-full aspect-auto">
                <LineChart accessibilityLayer data={data.daily.map(day => ({ ...day, value: day.collecting ? day[key] : null }))} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickFormatter={value => String(value).slice(5)} tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} width={40} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={label => `${label} (태평양 시간)`} formatter={value => [`${formatNumber(Number(value))} 단위`, title]} />
                  <Line dataKey="value" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>)}
        </div>
        <Card>
          <CardHeader><CardTitle>기능별 사용량</CardTitle><CardDescription>오늘 실제로 전송한 요청 · 재시도·페이지별 호출 포함</CardDescription></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>기능</TableHead><TableHead className="text-right">요청</TableHead><TableHead className="text-right">검색 단위</TableHead><TableHead className="text-right">일반 단위</TableHead><TableHead className="text-right">실패</TableHead></TableRow></TableHeader>
              <TableBody>{data.features.map(feature => <TableRow key={feature.source}><TableCell className="font-medium whitespace-nowrap">{feature.label}</TableCell>
                {[feature.requests, feature.searchUnits, feature.dataUnits, feature.errors].map((count, index) => <TableCell key={index} className="text-right tabular-nums">{formatNumber(count)}</TableCell>)}
              </TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>집계 범위</CardTitle></CardHeader><CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>수집 시작: {formatDate(data.startedAt)}. 수집 전 날짜는 차트에 표시하지 않으며, 시작 당일은 일부 기간만 포함됩니다. 집계는 90일 보관합니다.</p>
          <p>이 서버의 API 키·Google OAuth 요청을 합산합니다. 두 인증이 같은 Google 프로젝트를 사용한다는 가정이며, 다른 서버나 앱에서 사용한 할당량은 포함하지 않습니다. 한도는 Google Cloud 프로젝트의 실제 설정에 맞춰 서버에서 설정할 수 있습니다.</p>
          <p>요청당 해당 버킷 1단위를 추정하며 실패한 요청도 포함합니다. 네트워크 오류·응답 대기 등 실제 차감 여부가 불확실한 요청은 오늘 {formatNumber(data.totals.uncertain)}건입니다. 영상 재생과 OAuth 토큰 발급·갱신은 Data API 집계에서 제외합니다.</p>
          <a href="https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas" target="_blank" rel="noreferrer" className="inline-flex underline underline-offset-4">Google Cloud에서 실제 할당량 확인</a>
        </CardContent></Card>
      </div>}
    </DataState>
  </>
}
