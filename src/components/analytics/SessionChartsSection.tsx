import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  QuestionAnalyticsItem,
  QuestionChartPoint,
  ScoreBucketPoint,
} from '@shared/analyticsTypes';
import { QUESTION_TYPE_LABELS } from '@shared/quizTypes';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

interface SessionChartsSectionProps {
  questionChartData: QuestionChartPoint[];
  scoreDistribution: ScoreBucketPoint[];
  participantCount: number;
}

const CHART_PALETTE = {
  burgundy: '#6B1D2F',
  burgundyMuted: '#8A3346',
  navy: '#232B3A',
  powderDark: '#9E7A7F',
  grid: '#E6DDD2',
  axis: '#5C6470',
};

export function SessionChartsSection({
  questionChartData,
  scoreDistribution,
  participantCount,
}: SessionChartsSectionProps) {
  const reducedMotion = usePrefersReducedMotion();
  const hasQuestionMetrics = questionChartData.some(
    (q) => q.answeredCount > 0 || q.unansweredCount > 0,
  );

  return (
    <section aria-labelledby="charts-section-title" className="space-y-4">
      <div>
        <h2
          id="charts-section-title"
          className="font-display font-bold text-xl text-navy-900"
        >
          Görsel Yarışma Grafikleri
        </h2>
        <p className="mt-1 text-sm text-navy-600">
          Sorulara göre başarı oranı, ortalama cevaplama hızı ve katılımcı puan dağılımı.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Sorulara göre başarı oranı */}
        <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card flex flex-col justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
              Grafik 1 · Başarı
            </span>
            <h3 className="mt-2 font-display font-bold text-base text-navy-900">
              Sorulara Göre Başarı Oranı
            </h3>
            <p className="mt-0.5 text-xs text-navy-600">
              Her soruda tam doğru yanıt veren öğrencilerin yüzdesi (%).
            </p>
          </div>

          {!hasQuestionMetrics ? (
            <div className="my-8 rounded-xl bg-cream-100 border border-cream-300 p-4 text-center text-xs text-navy-600">
              Bu yarışmada soru başarı grafiği oluşturmak için yeterli yanıt verisi bulunmuyor.
            </div>
          ) : (
            <div
              className="mt-4 h-56 w-full min-w-0"
              role="img"
              aria-label="Sorulara göre başarı oranı sütun grafiği"
            >
              <ResponsiveContainer width="100%" height={220} minWidth={200}>
                <BarChart
                  data={questionChartData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 18 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_PALETTE.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: CHART_PALETTE.axis, fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: CHART_PALETTE.grid }}
                    tickLine={false}
                  >
                    <Label
                      value="Sorular"
                      offset={-10}
                      position="insideBottom"
                      fill={CHART_PALETTE.axis}
                      fontSize={11}
                    />
                  </XAxis>
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    width={42}
                    tick={{ fill: CHART_PALETTE.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [`%${Number(value ?? 0)}`, 'Başarı Oranı']}
                    labelFormatter={(label: unknown, payload) => {
                      const row = payload?.[0]?.payload as QuestionChartPoint | undefined;
                      return row ? `${String(label)} — ${row.shortTitle}` : String(label);
                    }}
                    contentStyle={{
                      backgroundColor: '#FAF7F4',
                      borderColor: '#DDD2C4',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#232B3A',
                    }}
                  />
                  <Bar
                    dataKey="successRatePct"
                    name="Başarı Oranı"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                    isAnimationActive={!reducedMotion}
                  >
                    {questionChartData.map((entry) => (
                      <Cell
                        key={entry.label}
                        fill={
                          entry.successRatePct >= 60
                            ? CHART_PALETTE.burgundy
                            : entry.successRatePct >= 35
                              ? CHART_PALETTE.burgundyMuted
                              : CHART_PALETTE.navy
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-cream-200 pt-2.5 text-[11px] text-navy-600">
            <span>Bordo: %60+ yüksek başarı</span>
            <span>Lacivert: %35 altı zor soru</span>
          </div>
        </article>

        {/* 2. Sorulara göre ortalama cevaplama süresi */}
        <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card flex flex-col justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
              Grafik 2 · Süre
            </span>
            <h3 className="mt-2 font-display font-bold text-base text-navy-900">
              Sorulara Göre Ortalama Cevaplama Süresi
            </h3>
            <p className="mt-0.5 text-xs text-navy-600">
              Her soruda yanıt gönderen öğrencilerin ortalama tepki süresi (saniye).
            </p>
          </div>

          {!hasQuestionMetrics ? (
            <div className="my-8 rounded-xl bg-cream-100 border border-cream-300 p-4 text-center text-xs text-navy-600">
              Bu yarışmada cevaplama süresi grafiği için kayıtlı yanıt bulunmuyor.
            </div>
          ) : (
            <div
              className="mt-4 h-56 w-full min-w-0"
              role="img"
              aria-label="Sorulara göre ortalama cevaplama süresi sütun grafiği"
            >
              <ResponsiveContainer width="100%" height={220} minWidth={200}>
                <BarChart
                  data={questionChartData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 18 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_PALETTE.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: CHART_PALETTE.axis, fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: CHART_PALETTE.grid }}
                    tickLine={false}
                  >
                    <Label
                      value="Sorular"
                      offset={-10}
                      position="insideBottom"
                      fill={CHART_PALETTE.axis}
                      fontSize={11}
                    />
                  </XAxis>
                  <YAxis
                    unit=" sn"
                    width={46}
                    tick={{ fill: CHART_PALETTE.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [
                      `${Number(value ?? 0).toFixed(2)} sn`,
                      'Ort. Süre',
                    ]}
                    labelFormatter={(label: unknown, payload) => {
                      const row = payload?.[0]?.payload as QuestionChartPoint | undefined;
                      return row ? `${String(label)} — ${row.shortTitle}` : String(label);
                    }}
                    contentStyle={{
                      backgroundColor: '#FAF7F4',
                      borderColor: '#DDD2C4',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#232B3A',
                    }}
                  />
                  <Bar
                    dataKey="avgResponseSec"
                    name="Ort. Cevaplama Süresi"
                    fill={CHART_PALETTE.navy}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                    isAnimationActive={!reducedMotion}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-cream-200 pt-2.5 text-[11px] text-navy-600">
            <span>Birim: Saniye (sn)</span>
            <span>Yalnızca yanıtlanan sorular hesaplanır</span>
          </div>
        </article>

        {/* 3. Oyuncuların puan dağılımı */}
        <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card flex flex-col justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
              Grafik 3 · Puan Dağılımı
            </span>
            <h3 className="mt-2 font-display font-bold text-base text-navy-900">
              Oyuncuların Puan Dağılımı
            </h3>
            <p className="mt-0.5 text-xs text-navy-600">
              Katılımcıların toplam puan aralıklarına göre öğrenci sayısı dağılımı.
            </p>
          </div>

          {participantCount === 0 || scoreDistribution.length === 0 ? (
            <div className="my-8 rounded-xl bg-cream-100 border border-cream-300 p-4 text-center text-xs text-navy-600">
              Katılımcı bulunmadığı için puan dağılımı grafiği gösterilemiyor.
            </div>
          ) : (
            <div
              className="mt-4 h-56 w-full min-w-0"
              role="img"
              aria-label="Oyuncuların puan dağılımı sütun grafiği"
            >
              <ResponsiveContainer width="100%" height={220} minWidth={200}>
                <BarChart
                  data={scoreDistribution}
                  margin={{ top: 12, right: 12, left: 0, bottom: 18 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_PALETTE.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="rangeLabel"
                    tick={{ fill: CHART_PALETTE.axis, fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: CHART_PALETTE.grid }}
                    tickLine={false}
                    interval={0}
                  >
                    <Label
                      value="Puan Aralığı"
                      offset={-10}
                      position="insideBottom"
                      fill={CHART_PALETTE.axis}
                      fontSize={11}
                    />
                  </XAxis>
                  <YAxis
                    allowDecimals={false}
                    width={34}
                    tick={{ fill: CHART_PALETTE.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [
                      `${Number(value ?? 0)} katılımcı`,
                      'Öğrenci Sayısı',
                    ]}
                    contentStyle={{
                      backgroundColor: '#FAF7F4',
                      borderColor: '#DDD2C4',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#232B3A',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Öğrenci Sayısı"
                    fill={CHART_PALETTE.burgundyMuted}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={!reducedMotion}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-cream-200 pt-2.5 text-[11px] text-navy-600">
            <span>Toplam: {participantCount} katılımcı</span>
            <span>5 eşit puan dilimi</span>
          </div>
        </article>
      </div>
    </section>
  );
}

interface QuestionOptionDistributionChartProps {
  question: QuestionAnalyticsItem;
}

export function QuestionOptionDistributionChart({
  question,
}: QuestionOptionDistributionChartProps) {
  const isOrdering = question.type === 'ORDERING';
  const isMultiSelect = question.type === 'MULTI_SELECT';
  const isTrueFalse = question.type === 'TRUE_FALSE';

  const subtitle = isOrdering
    ? 'Doğru sıralama eşleşme oranı ve her sıra adımının (1., 2., 3...) doğru yerleştirilme yüzdesi'
    : isMultiSelect
      ? 'Her seçeneğin öğrenciler tarafından işaretlenme sıklığı ve kısmi/tam doğru dağılımı'
      : isTrueFalse
        ? 'Doğru / Yanlış iki seçenekli yanıt dağılımı'
        : 'Her cevap seçeneğinin işaretlenme sayısı ve yüzdesi';

  return (
    <div className="mt-4 rounded-xl bg-cream-100 border border-cream-300 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-display font-bold text-sm text-navy-900">
            Cevap Seçeneklerinin Dağılımı ({QUESTION_TYPE_LABELS[question.type]})
          </h4>
          <p className="text-xs text-navy-600">{subtitle}</p>
        </div>
        {isOrdering && question.successRatePct !== null && (
          <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-bold text-burgundy-700">
            Tam Sıralama Eşleşmesi: %{question.successRatePct}
          </span>
        )}
        {isMultiSelect && question.partialCount > 0 && (
          <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-2.5 py-1 text-xs font-semibold text-navy-800">
            Kısmi Doğru Yanıt: {question.partialCount} öğrenci
          </span>
        )}
      </div>

      {question.optionDistribution.length === 0 ? (
        <p className="text-xs text-navy-600">Seçenek dağılım verisi bulunmuyor.</p>
      ) : (
        <ul className="space-y-2.5" aria-label={`Soru ${question.questionNumber} seçenek dağılımı`}>
          {question.optionDistribution.map((opt) => {
            const pct = Math.max(0, Math.min(100, opt.percentageOfPlayers));
            return (
              <li
                key={opt.optionId}
                className="rounded-xl bg-cream-50 border border-cream-300 p-3 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold shrink-0',
                        opt.isCorrect
                          ? 'bg-burgundy-600 text-cream-50'
                          : 'bg-cream-200 text-navy-800',
                      )}
                    >
                      {isOrdering
                        ? opt.label || `${opt.order + 1}. Sıra`
                        : opt.isCorrect
                          ? `${opt.label} · Doğru Seçenek`
                          : `${opt.label} · Seçenek`}
                    </span>
                    <span className="font-semibold text-navy-900 break-words">
                      {opt.text}
                    </span>
                  </div>

                  <span className="font-bold tabular-nums text-navy-800 shrink-0">
                    {opt.count} öğrenci (%{opt.percentageOfPlayers})
                  </span>
                </div>

                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-cream-200"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${opt.text} seçilme oranı %${opt.percentageOfPlayers}`}
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      opt.isCorrect ? 'bg-burgundy-600' : 'bg-navy-700',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
