import { View } from "@tarojs/components";
import type { SafetyBriefing } from "@construction/domain";

import {
  Card,
  CardMeta,
  Divider,
  KV,
  Row,
  Sheet,
} from "../../../components/ui";
import type { ProjectParticipant } from "../../../services/management.types";
import { namesInRow, unconfirmedNames } from "../safety-view";

/** 一天里发过的交底：内容是一张卡片，谁还没确认单独一行，带警戒条。 */
export const BriefingCards = ({
  briefings,
  members,
}: {
  readonly briefings: readonly SafetyBriefing[];
  /** 本班在场的工人。 */
  readonly members: readonly ProjectParticipant[];
}): JSX.Element => (
  <>
    {briefings.map((briefing) => {
      const confirmed = briefing.acknowledgements.map((ack) => ack.name);
      const waiting = unconfirmedNames(briefing, members);
      const inRow = namesInRow(waiting);
      return (
        <View key={briefing.id}>
          <Card gap>
            <View className="team-safety__title">{briefing.title}</View>
            <CardMeta>已确认 {confirmed.length} 人</CardMeta>
            <View className="team-safety__text">{briefing.content}</View>
            {confirmed.length > 0 || inRow.listed ? <Divider /> : null}
            {confirmed.length > 0 ? (
              <KV label="已确认" value={confirmed.join("、")} />
            ) : null}
            {inRow.listed ? (
              <KV label="还没确认" value={waiting.join("、")} />
            ) : null}
          </Card>
          <Sheet gap>
            {waiting.length === 0 ? (
              <Row title="还没确认" value="没有" mute />
            ) : (
              <Row title="还没确认" value={inRow.value} hazard />
            )}
          </Sheet>
        </View>
      );
    })}
  </>
);
