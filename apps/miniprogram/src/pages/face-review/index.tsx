import { Image, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  joinText,
  personInitial,
} from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  FormArea,
  LineIcon,
  Notice,
  PageHeader,
  PRESS,
  Row,
  Screen,
  Segmented,
  Sheet,
  Stamp,
  StateView,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { displayProjectRole } from "../../routing/features";
import {
  fetchFacePhoto,
  fetchProjectFaces,
  reviewFaceProfile,
  type FaceProfile,
} from "../../services/face";
import { fetchParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import { errorMessage } from "../../services/error-messages";
import { formatChinaDate, formatChinaHm } from "../../services/time";

import {
  faceReviewStatus,
  facesForTab,
  shownFaceId,
  splitAtOpen,
  type ReviewTab,
} from "./review-view";

import "./index.scss";

type Decision = "APPROVED" | "REJECTED";

/** “11-18 09:20” */
const shortTime = (iso: string): string =>
  `${formatChinaDate(iso).slice(5)} ${formatChinaHm(iso)}`;

/** 大照片：读取中是等高的骨架，没读到时点一下重读。 */
const FacePhoto = ({
  url,
  loading,
  onRetry,
}: {
  readonly url: string | null;
  readonly loading: boolean;
  readonly onRetry: () => void;
}): JSX.Element =>
  url !== null ? (
    <View className="face-review__photo">
      <Image className="face-review__image" src={url} mode="aspectFit" />
    </View>
  ) : loading ? (
    <View className="face-review__photo sk" aria-label="正在读取底照" />
  ) : (
    <View className="face-review__photo ui-press" {...PRESS} onClick={onRetry}>
      <LineIcon name="face" tone="muted" />
      <View>底照没读到，点一下重新读取</View>
    </View>
  );

export default function FaceReviewPage(): JSX.Element {
  useSessionGuard();
  const projectId = Taro.useRouter().params.projectId;
  const { revision, refresh } = usePageRefresh();
  const [profiles, setProfiles] = useState<readonly FaceProfile[] | null>(null);
  const [people, setPeople] = useState<readonly ProjectParticipant[]>([]);
  const [photo, setPhoto] = useState<{
    readonly id: string;
    readonly url: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [reviewReason, setReviewReason] = useState<string>("");
  const [tab, setTab] = useState<ReviewTab>("PENDING");
  // 一次只展开一条，其余收成一行。
  const [openId, setOpenId] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState<boolean>(false);
  const [deciding, setDeciding] = useState<Decision | null>(null);
  useEffect(() => {
    if (projectId === undefined) return;
    let cancelled = false;
    void Promise.all([
      fetchProjectFaces(projectId),
      fetchParticipants(projectId),
    ]).then(
      ([faces, members]) => {
        if (!cancelled) {
          setProfiles(faces);
          setPeople(members);
          setError(null);
        }
      },
      (reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason, "读取审核列表失败"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);
  const viewPhoto = async (id: string): Promise<void> => {
    if (projectId === undefined || busy) return;
    setBusy(true);
    setError(null);
    setPhoto(null);
    setPhotoFailed(false);
    setReviewReason("");
    try {
      const result = await fetchFacePhoto(projectId, id);
      setPhoto({ id, url: result.dataUrl });
    } catch (reason: unknown) {
      setPhotoFailed(true);
      setError(errorMessage(reason, "读取底照失败"));
    } finally {
      setBusy(false);
    }
  };
  const review = async (id: string, decision: Decision): Promise<void> => {
    if (projectId === undefined || busy || photo?.id !== id) return;
    const reason = reviewReason.trim();
    if (reason.length === 0) {
      setError("请先填写核对依据或不通过原因。");
      return;
    }
    const result = await Taro.showModal({
      title:
        decision === "APPROVED" ? "确认已核对本人和人员档案" : "确认审核不通过",
      content: reason,
      confirmText: "确认审核",
    });
    if (!result.confirm) return;
    setBusy(true);
    setDeciding(decision);
    setError(null);
    try {
      const updated = await reviewFaceProfile(projectId, id, decision, reason);
      // 先把这一条换成新结果，下一条马上顶上来；随后再重读一遍核对。
      setProfiles((rows) =>
        rows === null
          ? rows
          : rows.map((row) => (row.id === id ? updated : row)),
      );
      setPhoto(null);
      refresh();
      void Taro.showToast({
        title: decision === "APPROVED" ? "已通过" : "已记为不通过",
        icon: "success",
      });
    } catch (failure: unknown) {
      setError(errorMessage(failure, "审核未完成"));
    } finally {
      setBusy(false);
      setDeciding(null);
    }
  };

  const list = facesForTab(profiles ?? [], tab);
  const shownId = shownFaceId(list, openId, tab);
  const { before, current, after } = splitAtOpen(list, shownId);
  const open = (id: string): void => {
    if (busy) return;
    setOpenId(id);
    void viewPhoto(id);
  };
  // 待审核里总有一条是展开的：刚进来、或上一条审完之后，最前面那条自动展开，
  // 这里替它把底照读出来。
  useEffect(() => {
    if (!busy && shownId !== null && shownId !== openId) open(shownId);
  }, [busy, shownId, openId]);

  const ownerOf = (profile: FaceProfile): ProjectParticipant | undefined =>
    people.find(
      (member) =>
        member.profileId === profile.ownerId &&
        member.participantType === profile.ownerType,
    );
  const nameOf = (profile: FaceProfile): string => {
    const owner = ownerOf(profile);
    return (
      owner?.displayName ??
      (owner ? `尾号 ${owner.phone.slice(-4)} 的成员` : "不在项目名单里的成员")
    );
  };
  /** 岗位和班组；收起的行里只写这两样，右边还要放状态。 */
  const postOf = (profile: FaceProfile): string => {
    const owner = ownerOf(profile);
    return joinText([
      owner ? displayProjectRole(owner.projectRoleLabel) : null,
      owner?.teamName,
    ]);
  };
  const row = (profile: FaceProfile): JSX.Element => (
    <Row
      key={profile.id}
      title={nameOf(profile)}
      avatar={personInitial(ownerOf(profile)?.displayName)}
      sub={postOf(profile) || `第 ${profile.version} 次提交`}
      status={faceReviewStatus(profile.status)}
      chevron
      onClick={() => open(profile.id)}
    />
  );

  const header = <PageHeader title="底照审核" />;
  if (projectId === undefined)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从项目人员页面进入" />
      </Screen>
    );
  if (profiles === null)
    return (
      <Screen header={header}>
        {error !== null ? (
          <StateView
            kind="error"
            title="审核列表没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView kind="loading" title="正在读取审核列表" />
        )}
      </Screen>
    );
  if (profiles.length === 0)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="还没有人提交底照"
          sub="成员在“我的”里提交人脸底照后，会出现在这里。"
        />
      </Screen>
    );

  const pendingCount = facesForTab(profiles, "PENDING").length;
  const owner = current ? ownerOf(current) : undefined;
  const ready = current !== null && photo?.id === current.id;
  const awaiting = current !== null && current.status === "PENDING";
  return (
    <Screen header={header}>
      <Segmented
        options={[
          {
            value: "PENDING" as const,
            label: pendingCount > 0 ? `待审核 ${pendingCount}` : "待审核",
          },
          { value: "DONE" as const, label: "已审核" },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setOpenId(null);
          setPhotoFailed(false);
          setError(null);
        }}
      />
      {list.length === 0 ? (
        <StateView
          kind="empty"
          title={tab === "PENDING" ? "没有待审核的底照" : "还没有审核过的底照"}
          sub={tab === "PENDING" ? "新提交的会出现在这里。" : undefined}
        />
      ) : null}
      {before.length > 0 ? <Sheet gap>{before.map(row)}</Sheet> : null}
      {current !== null ? (
        <View key={current.id} className="m-fade">
          <Card gap stamped={current.status === "APPROVED"}>
            <CardTitle
              status={
                current.status === "APPROVED"
                  ? undefined
                  : faceReviewStatus(current.status)
              }
            >
              {nameOf(current)}
            </CardTitle>
            <CardMeta>
              {joinText([postOf(current), `第 ${current.version} 次提交`])}
            </CardMeta>
            <CardMeta>
              {joinText([
                owner ? `手机号 ${owner.phone}` : null,
                `${shortTime(current.createdAt)} 提交`,
              ])}
            </CardMeta>
            {current.reviewReason ? (
              <CardMeta>审核说明：{current.reviewReason}</CardMeta>
            ) : null}
            {current.status === "APPROVED" ? (
              <Stamp
                text="已通过"
                sub={
                  current.reviewedAt
                    ? formatChinaDate(current.reviewedAt).slice(5)
                    : undefined
                }
              />
            ) : null}
            {awaiting ? null : (
              <CardActions>
                <Button
                  variant="text"
                  onClick={() => {
                    setOpenId(null);
                    setError(null);
                  }}
                >
                  收起
                </Button>
              </CardActions>
            )}
          </Card>
          <FacePhoto
            url={ready && photo ? photo.url : null}
            loading={!photoFailed}
            onRetry={() => open(current.id)}
          />
          {awaiting && ready ? (
            <Sheet gap>
              <FormArea
                label="核对依据或不通过原因"
                required
                value={reviewReason}
                placeholder="例如：已和本人、身份证核对"
                maxLength={140}
                disabled={deciding !== null}
                onInput={setReviewReason}
              />
            </Sheet>
          ) : null}
          {error !== null ? <Notice tone="error">{error}</Notice> : null}
        </View>
      ) : error !== null ? (
        <Notice tone="error">{error}</Notice>
      ) : null}
      {after.length > 0 ? <Sheet gap>{after.map(row)}</Sheet> : null}
      {tab === "PENDING" && list.length > 0 ? (
        <Notice>要当面或对照证件核对是不是本人。不能审核自己的底照。</Notice>
      ) : null}
      {current !== null && awaiting ? (
        <BottomBar
          primary={deciding === "APPROVED" ? "提交中…" : "核对通过"}
          busy={deciding !== null}
          disabled={!ready}
          onPrimary={() => {
            void review(current.id, "APPROVED");
          }}
        >
          <Button
            variant="danger"
            disabled={!ready || deciding !== null}
            onClick={() => {
              void review(current.id, "REJECTED");
            }}
          >
            {deciding === "REJECTED" ? "提交中…" : "不通过"}
          </Button>
        </BottomBar>
      ) : null}
    </Screen>
  );
}
