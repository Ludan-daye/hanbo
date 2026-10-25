import { Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Field,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  faceStatusLabel,
  fetchFacePhoto,
  fetchProjectFaces,
  reviewFaceProfile,
  type FaceProfile,
} from "../../services/face";
import { fetchParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";

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
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "读取审核列表失败",
          );
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
    setReviewReason("");
    try {
      const result = await fetchFacePhoto(projectId, id);
      setPhoto({ id, url: result.dataUrl });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "读取底照失败");
    } finally {
      setBusy(false);
    }
  };
  const review = async (
    id: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<void> => {
    if (projectId === undefined || busy || photo?.id !== id) return;
    const reason = reviewReason.trim();
    if (reason.length === 0) {
      setError("请填写审核说明。");
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
    setError(null);
    try {
      await reviewFaceProfile(projectId, id, decision, reason);
      setPhoto(null);
      refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "审核未完成");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="人脸档案审核" />
      <Notice>请核对照片中的本人及人员档案后审核；不能审核自己的底照。</Notice>
      {error !== null ? <Notice>{error}</Notice> : null}
      {projectId === undefined ? (
        <StateView title="请从项目成员页面进入" />
      ) : null}
      {projectId !== undefined && profiles === null ? (
        <StateView title="读取审核列表" onRetry={refresh} />
      ) : null}
      {profiles?.length === 0 ? (
        <StateView
          title="暂无待查看的人脸档案"
          sub="成员可在“我的 → 人脸档案”提交底照。"
        />
      ) : null}
      {profiles?.map((profile) => {
        const person = people.find(
          (member) =>
            member.profileId === profile.ownerId &&
            member.participantType === profile.ownerType,
        );
        return (
          <Section
            key={profile.id}
            title={
              person?.displayName ??
              `成员 · ${person?.phone ?? profile.ownerId}`
            }
            sub={`${faceStatusLabel(profile.status)} · 第 ${profile.version} 版`}
          >
            {profile.reviewReason ? (
              <Subtitle>{profile.reviewReason}</Subtitle>
            ) : null}
            {photo?.id === profile.id ? (
              <Image
                src={photo.url}
                mode="aspectFit"
                style={{ width: "100%", height: "220px" }}
              />
            ) : null}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void viewPhoto(profile.id);
              }}
            >
              查看底照
            </Button>
            {profile.status === "PENDING" && photo?.id === profile.id ? (
              <>
                <Field
                  value={reviewReason}
                  onInput={setReviewReason}
                  placeholder="填写核对依据或不通过原因"
                />
                <Button
                  loading={busy}
                  onClick={() => {
                    void review(profile.id, "APPROVED");
                  }}
                >
                  核对通过
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void review(profile.id, "REJECTED");
                  }}
                >
                  审核不通过
                </Button>
              </>
            ) : null}
          </Section>
        );
      })}
    </Screen>
  );
}
