import { Image, View } from "@tarojs/components";
import type { PropsWithChildren, ReactNode } from "react";

import {
  BottomBar,
  Button,
  Card,
  CardMeta,
  Check,
  KV,
  Links,
  Notice,
  Photo,
  Row,
  Say,
  Sheet,
  Stamp,
} from "../../components/ui/index";
import type { FaceLivenessTestResult } from "../../services/face";

// 每一屏的 children 是页面统一接在内容后面的东西（提示、出错原因、入场时的“退出登录”），
// 放在底部操作条之前。

type ConsentProps = {
  readonly consented: boolean;
  readonly consentOpen: boolean;
  readonly consentText: string;
  readonly busy: boolean;
  readonly onConsent: () => void;
  readonly onConsentText: () => void;
};

/** 同意采集与使用说明：一行勾选。说明全文点了“查看说明”才展开。 */
const Consent = ({
  consented,
  consentOpen,
  consentText,
  busy,
  onConsent,
}: Omit<ConsentProps, "onConsentText">): JSX.Element => (
  <>
    <Sheet gap>
      <Row
        title="我已阅读并同意采集与使用说明"
        onClick={busy ? undefined : onConsent}
      >
        <Check checked={consented} />
      </Row>
    </Sheet>
    {consentOpen ? (
      <View className="m-fade">
        <Card gap>
          <CardMeta>{consentText}</CardMeta>
        </Card>
      </View>
    ) : null}
  </>
);

const ConsentTextButton = ({
  open,
  onClick,
}: {
  readonly open: boolean;
  readonly onClick: () => void;
}): JSX.Element => (
  <Button variant="text" onClick={onClick}>
    {open ? "收起说明" : "查看说明"}
  </Button>
);

/**
 * 交了底照以后（审核中、已通过、要重拍）也能再看一遍采集说明：
 * 一个文字按钮，点开是和勾选同意时一样的说明卡片。
 */
export const ConsentReader = ({
  open,
  text,
  onToggle,
}: {
  readonly open: boolean;
  readonly text: string;
  readonly onToggle: () => void;
}): JSX.Element | null =>
  text ? (
    <>
      <Links>
        <Button variant="text" onClick={onToggle}>
          {open ? "收起采集说明" : "查看采集说明"}
        </Button>
      </Links>
      {open ? (
        <View className="m-fade">
          <Card gap>
            <CardMeta>{text}</CardMeta>
          </Card>
        </View>
      ) : null}
    </>
  ) : null;

const RefreshButton = ({
  busy,
  onClick,
}: {
  readonly busy: boolean;
  readonly onClick: () => void;
}): JSX.Element => (
  <Button variant="text" disabled={busy} onClick={onClick}>
    刷新状态
  </Button>
);

/** 还没录入：先勾同意，再拍。不同意拍不了。 */
export const CaptureView = ({
  steps,
  shooting,
  onShoot,
  children,
  ...consent
}: PropsWithChildren<
  ConsentProps & {
    /** 入场时顶上的步骤条。 */
    readonly steps: ReactNode;
    readonly shooting: boolean;
    readonly onShoot: () => void;
  }
>): JSX.Element => (
  <>
    {steps}
    <Say
      title="拍一张本人正脸"
      sub="打卡时用它核对是不是你本人，微信头像不算。"
    />
    {/* 只是示意脸要拍完整；真正拍照用的是系统相机。 */}
    <View className="face-guide">
      <View className="face-guide__oval" />
      <View className="face-guide__label">正脸完整清晰，光线要足</View>
    </View>
    <Consent {...consent} />
    {children}
    <BottomBar
      primary={shooting ? "拍摄中…" : "拍摄底照"}
      busy={consent.busy}
      disabled={!consent.consented}
      onPrimary={onShoot}
    >
      <ConsentTextButton
        open={consent.consentOpen}
        onClick={consent.onConsentText}
      />
    </BottomBar>
  </>
);

/** 拍好了，交之前看一眼。换底照时同意是在这一屏勾的。 */
export const PreviewView = ({
  steps,
  photo,
  replacing,
  submitting,
  onSubmit,
  onRetake,
  children,
  ...consent
}: PropsWithChildren<
  ConsentProps & {
    readonly steps: ReactNode;
    readonly photo: string;
    /** 已经有一张底照，这次是换。 */
    readonly replacing: boolean;
    readonly submitting: boolean;
    readonly onSubmit: () => void;
    readonly onRetake: () => void;
  }
>): JSX.Element => (
  <>
    {steps}
    <Say
      title="看看这张行不行"
      sub="要拍清楚、拍完整，是你本人。不满意就重拍。"
    />
    <Image className="face-photo" src={photo} mode="aspectFit" />
    <Consent {...consent} />
    {replacing ? (
      <Notice>交上去之后原来的底照就作废，新的审核通过才能打卡。</Notice>
    ) : null}
    {children}
    <BottomBar
      primary={submitting ? "提交中…" : "提交审核"}
      busy={consent.busy}
      disabled={!consent.consented}
      onPrimary={onSubmit}
    >
      <ConsentTextButton
        open={consent.consentOpen}
        onClick={consent.onConsentText}
      />
      <Button variant="outline" disabled={consent.busy} onClick={onRetake}>
        重拍
      </Button>
    </BottomBar>
  </>
);

/** 审核中：交上去之后只有一件事可做，进首页。 */
export const PendingView = ({
  submittedAt,
  justSaved,
  onboarding,
  busy,
  entering,
  testRow,
  onHome,
  onReplace,
  onRefresh,
  children,
}: PropsWithChildren<{
  readonly submittedAt: string;
  /** 这次进来刚交的。 */
  readonly justSaved: boolean;
  readonly onboarding: boolean;
  readonly busy: boolean;
  readonly entering: boolean;
  /** “活体测试”那一行，没开视频活体时没有。 */
  readonly testRow: ReactNode;
  readonly onHome: () => void;
  readonly onReplace: () => void;
  readonly onRefresh: () => void;
}>): JSX.Element => (
  <>
    <Say
      title="底照审核中"
      sub={
        justSaved
          ? "交上去了。管理员审核通过后才能正式打卡。"
          : "管理员审核通过后才能正式打卡。"
      }
    />
    <Photo icon="face" label="已提交的底照" />
    <Sheet gap>
      <Row title="状态" status={{ kind: "warn", text: "待管理员审核" }} />
      <Row title="提交时间">
        <View className="num">{submittedAt}</View>
      </Row>
      {testRow}
    </Sheet>
    {children}
    <BottomBar
      primary={entering ? "进入中…" : onboarding ? "进入首页" : "回首页"}
      busy={busy}
      onPrimary={onHome}
    >
      <Button variant="text" disabled={busy} onClick={onReplace}>
        更换底照
      </Button>
      {onboarding ? null : <RefreshButton busy={busy} onClick={onRefresh} />}
    </BottomBar>
  </>
);

/** 已通过：落一个章。以后从“我的”进来看到的就是这一屏。 */
export const ApprovedView = ({
  stampDay,
  submittedAt,
  reviewedAt,
  reason,
  onboarding,
  busy,
  entering,
  testRow,
  onHome,
  onReplace,
  onRefresh,
  children,
}: PropsWithChildren<{
  readonly stampDay?: string;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly reason: string | null;
  readonly onboarding: boolean;
  readonly busy: boolean;
  readonly entering: boolean;
  readonly testRow: ReactNode;
  readonly onHome: () => void;
  readonly onReplace: () => void;
  readonly onRefresh: () => void;
}>): JSX.Element => (
  <>
    <Stamp size="lg" play text="已通过" sub={stampDay} />
    <Say
      center
      title="底照可以用来打卡了"
      sub="每次打卡会拿现场的人脸和它比对。"
    />
    <Sheet gap>
      <Row title="提交时间">
        <View className="num">{submittedAt}</View>
      </Row>
      {reviewedAt !== null ? (
        <Row title="审核时间">
          <View className="num">{reviewedAt}</View>
        </Row>
      ) : null}
      {testRow}
    </Sheet>
    {reason ? <Notice>审核意见：{reason}</Notice> : null}
    {children}
    {/* 从“我的”进来时这一屏没有主操作，按返回就回去了；入场时还要有一个进首页的按钮。 */}
    <BottomBar
      primary={onboarding ? (entering ? "进入中…" : "进入首页") : undefined}
      busy={busy}
      onPrimary={onHome}
    >
      <Button variant="outline" disabled={busy} onClick={onReplace}>
        更换底照
      </Button>
      {onboarding ? null : <RefreshButton busy={busy} onClick={onRefresh} />}
    </BottomBar>
  </>
);

/** 没通过，或者旧照已经不能用了：说清楚为什么，按钮就是重拍。 */
export const RetakeView = ({
  rejected,
  statusText,
  reason,
  submittedAt,
  onboarding,
  busy,
  shooting,
  onShoot,
  onRefresh,
  children,
}: PropsWithChildren<{
  /** 管理员审核没通过；否则是别的不能用的状态。 */
  readonly rejected: boolean;
  /** 别的状态时显示的状态名。 */
  readonly statusText: string;
  readonly reason: string | null;
  readonly submittedAt: string;
  readonly onboarding: boolean;
  readonly busy: boolean;
  readonly shooting: boolean;
  readonly onShoot: () => void;
  readonly onRefresh: () => void;
}>): JSX.Element => (
  <>
    {rejected ? (
      <>
        <Say title="底照没通过" sub="看一下原因，重新拍一张清楚的正脸。" />
        <Notice tone="error">
          审核意见
          <View className="ui-notice__sub">
            {reason ?? "管理员没有写原因。重新拍一张清楚的正脸。"}
          </View>
        </Notice>
        <Photo icon="face" label="上次提交的底照" />
      </>
    ) : (
      <>
        <Say
          title="要重新拍一张底照"
          sub="原来的底照已经不能用了，重新拍一张交给管理员审核。"
        />
        <Photo icon="face" label="上次提交的底照" />
        <Sheet gap>
          <Row title="状态" value={statusText} mute />
          <Row title="提交时间">
            <View className="num">{submittedAt}</View>
          </Row>
        </Sheet>
        {reason ? <Notice>审核意见：{reason}</Notice> : null}
      </>
    )}
    {children}
    <BottomBar
      primary={shooting ? "拍摄中…" : "重新拍摄底照"}
      busy={busy}
      onPrimary={onShoot}
    >
      {onboarding ? null : <RefreshButton busy={busy} onClick={onRefresh} />}
    </BottomBar>
  </>
);

/** 活体测试：照打卡时的样子核验一次，不计考勤。平时用不到，所以单独一屏。 */
export const TestView = ({
  ready,
  submitted,
  pendingReview,
  onPhone,
  busy,
  result,
  detailsOpen,
  onDetails,
  onStart,
  children,
}: PropsWithChildren<{
  /** 能不能开始：在手机小程序里，而且底照在审核中或已通过。 */
  readonly ready: boolean;
  readonly submitted: boolean;
  readonly pendingReview: boolean;
  readonly onPhone: boolean;
  readonly busy: boolean;
  readonly result: FaceLivenessTestResult | null;
  readonly detailsOpen: boolean;
  readonly onDetails: () => void;
  readonly onStart: () => void;
}>): JSX.Element => (
  <>
    <Say
      title="试一次人脸核验"
      sub="按提示做两个动作，大约 8 秒，和你的底照比对。不计考勤，不用排班和定位。"
    />
    {result === null ? null : result.status === "VERIFIED" ? (
      <Notice tone="success">
        测试通过
        <View className="ui-notice__sub">没有生成考勤记录。</View>
      </Notice>
    ) : (
      <Notice tone="error">
        测试没通过
        <View className="ui-notice__sub">按提示的动作顺序再测一次。</View>
      </Notice>
    )}
    {result === null ? null : (
      <>
        <Sheet gap>
          <Row
            title="结果详情"
            value={detailsOpen ? "收起" : "查看"}
            mute
            onClick={onDetails}
          />
        </Sheet>
        {detailsOpen ? (
          <View className="face-detail m-fade">
            <Card gap>
              {result.score !== null ? (
                <KV label="人脸相似度" value={result.score.toFixed(2)} />
              ) : null}
              {result.failureCode !== null ? (
                <KV label="云端结果" value={result.failureCode} />
              ) : null}
              {result.requestId !== null ? (
                <KV label="云端请求编号" value={result.requestId} />
              ) : null}
              {result.score === null &&
              result.failureCode === null &&
              result.requestId === null ? (
                <CardMeta>这次测试没有更多详情。</CardMeta>
              ) : null}
            </Card>
          </View>
        ) : null}
      </>
    )}
    {!submitted ? (
      <Notice>要先交底照。底照在审核中或已通过，才能测试。</Notice>
    ) : pendingReview ? (
      <Notice>底照还在审核，现在只能测试，不能正式打卡。</Notice>
    ) : null}
    {onPhone ? null : <Notice>摄像头测试要在手机上的小程序里做。</Notice>}
    {children}
    <BottomBar
      primary={result === null ? "开始测试" : "再测一次"}
      disabled={busy || !ready}
      onPrimary={onStart}
    />
  </>
);
